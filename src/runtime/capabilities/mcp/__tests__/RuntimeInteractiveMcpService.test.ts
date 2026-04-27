import { describe, expect, mock, test } from 'bun:test'

import type { Command } from '../../../../commands.js'
import type {
  ConnectedMCPServer,
  MCPServerConnection,
  ScopedMcpServerConfig,
  ServerResource,
} from '../../../../services/mcp/types.js'
import type { AppState } from '../../../../state/AppState.js'
import type { Tool } from '../../../../Tool.js'
import type { PluginError } from '../../../../types/plugin.js'
import {
  createRuntimeInteractiveMcpService,
  type RuntimeInteractiveMcpServiceDeps,
  type RuntimeInteractiveMcpServiceOptions,
  type RuntimeMcpConnectionAttempt,
  type RuntimeMcpServerUpdate,
} from '../RuntimeInteractiveMcpService.js'

function createAppState(clients: MCPServerConnection[] = []): AppState {
  return {
    mcp: {
      clients,
      tools: [],
      commands: [],
      resources: {},
    },
    plugins: {
      errors: [],
    },
  } as unknown as AppState
}

function stdioConfig(
  scope: ScopedMcpServerConfig['scope'] = 'project',
): ScopedMcpServerConfig {
  return {
    type: 'stdio',
    command: 'echo',
    args: [],
    scope,
  }
}

function httpConfig(
  scope: ScopedMcpServerConfig['scope'] = 'project',
): ScopedMcpServerConfig {
  return {
    type: 'http',
    url: 'https://example.com/mcp',
    scope,
  }
}

type MockMcpClient = {
  onclose?: () => void
  setNotificationHandler: ReturnType<typeof mock>
  removeNotificationHandler: ReturnType<typeof mock>
}

function createConnectedClient(
  name: string,
  config: ScopedMcpServerConfig,
  capabilities: ConnectedMCPServer['capabilities'] = {},
): Extract<MCPServerConnection, { type: 'connected' }> {
  return {
    name,
    type: 'connected',
    config,
    capabilities,
    client: {
      onclose: () => {},
      setNotificationHandler: mock(() => {}),
      removeNotificationHandler: mock(() => {}),
    },
    cleanup: async () => {},
  } as unknown as Extract<MCPServerConnection, { type: 'connected' }>
}

function getMockMcpClient(client: ConnectedMCPServer): MockMcpClient {
  return client.client as unknown as MockMcpClient
}

function createAttempt(
  client: MCPServerConnection,
): RuntimeMcpConnectionAttempt {
  return {
    client,
    tools: [],
    commands: [],
    resources: [],
  }
}

function createCachedAsync<TArgs extends unknown[], TResult>(
  impl: (...args: TArgs) => Promise<TResult>,
): ((...args: TArgs) => Promise<TResult>) & {
  cache: Map<string, Promise<TResult>>
} {
  const fn = mock(impl) as unknown as ((...args: TArgs) => Promise<TResult>) & {
    cache: Map<string, Promise<TResult>>
  }
  fn.cache = new Map<string, Promise<TResult>>()
  return fn
}

function createHarness(input?: {
  appState?: AppState
  deps?: Partial<Record<keyof RuntimeInteractiveMcpServiceDeps, unknown>>
  getAllowedChannels?: NonNullable<
    RuntimeInteractiveMcpServiceOptions['getAllowedChannels']
  >
  dynamicMcpConfig?: Record<string, ScopedMcpServerConfig>
  isStrictMcpConfig?: boolean
}) {
  let appState = input?.appState ?? createAppState()
  const updates: RuntimeMcpServerUpdate[] = []
  const attempts: RuntimeMcpConnectionAttempt[] = []
  const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const channelMessages: Array<{
    serverName: string
    content: string
    meta?: Record<string, string>
  }> = []
  const channelPermissionResolutions: Array<{
    requestId: string
    behavior: 'allow' | 'deny'
    serverName: string
  }> = []
  const channelBlockedNotifications: Array<{ kind: string; text: string }> = []
  const elicitationRegistrations: string[] = []
  const setAppState = mock((updater: (prev: AppState) => AppState) => {
    appState = updater(appState)
  })
  const fetchToolsForClient = createCachedAsync(async () => [] as Tool[])
  const fetchCommandsForClient = createCachedAsync(async () => [] as Command[])
  const fetchResourcesForClient = createCachedAsync(
    async () => [] as ServerResource[],
  )
  const deps = {
    getClaudeCodeMcpConfigs: mock(async () => ({ servers: {}, errors: [] })),
    clearClaudeAIMcpConfigsCache: mock(() => {}),
    fetchClaudeAIMcpConfigsIfEligible: mock(async () => ({})),
    doesEnterpriseMcpConfigExist: mock(() => false),
    filterMcpServersByPolicy: mock(
      (configs: Record<string, ScopedMcpServerConfig>) => ({
        allowed: configs,
        blocked: [],
      }),
    ),
    dedupClaudeAiMcpServers: mock(
      (
        claudeAiServers: Record<string, ScopedMcpServerConfig>,
        _manualServers: Record<string, ScopedMcpServerConfig>,
      ) => ({
        servers: claudeAiServers,
        suppressed: [],
      }),
    ),
    getMcpToolsCommandsAndResources: mock(
      async (
        _onConnectionAttempt: (attempt: RuntimeMcpConnectionAttempt) => void,
        _mcpConfigs?: Record<string, ScopedMcpServerConfig>,
      ) => {},
    ),
    fetchToolsForClient,
    fetchCommandsForClient,
    fetchResourcesForClient,
    fetchMcpSkillsForClient: null,
    clearSkillIndexCache: null,
    reconnectMcpServerImpl: mock(async (name: string, config) =>
      createAttempt({ name, type: 'connected', config } as MCPServerConnection),
    ),
    clearServerCache: mock(async () => {}),
    isMcpServerDisabled: mock(() => false),
    setMcpServerEnabled: mock(() => {}),
    excludeStalePluginClients: mock(
      (
        mcp: {
          clients: MCPServerConnection[]
          tools: Tool[]
          commands: Command[]
          resources: Record<string, ServerResource[]>
        },
        _configs: Record<string, ScopedMcpServerConfig>,
      ) => ({ ...mcp, stale: [] }),
    ),
    logForDebugging: mock(() => {}),
    logEvent: mock(() => {}),
    logMCPDebug: mock(() => {}),
    logMCPError: mock(() => {}),
    ...input?.deps,
  } as unknown as RuntimeInteractiveMcpServiceDeps
  const service = createRuntimeInteractiveMcpService(
    {
      getAppState: () => appState,
      setAppState,
      getAllowedChannels: input?.getAllowedChannels ?? (() => []),
      dynamicMcpConfig: input?.dynamicMcpConfig,
      isStrictMcpConfig: input?.isStrictMcpConfig,
      reconnectTimers,
      updateServer: update => {
        updates.push(update)
      },
      onConnectionAttempt: attempt => {
        attempts.push(attempt)
      },
      registerElicitationHandler: client => {
        elicitationRegistrations.push(client.name)
      },
      enqueueChannelMessage: message => {
        channelMessages.push(message)
      },
      resolveChannelPermission: permission => {
        channelPermissionResolutions.push(permission)
        return true
      },
      notifyChannelBlocked: notification => {
        channelBlockedNotifications.push(notification)
      },
      channelWarnedKinds: new Set(),
    },
    deps,
  )

  return {
    get appState() {
      return appState
    },
    attempts,
    channelBlockedNotifications,
    channelMessages,
    channelPermissionResolutions,
    deps,
    elicitationRegistrations,
    reconnectTimers,
    service,
    setAppState,
    updates,
  }
}

describe('RuntimeInteractiveMcpService', () => {
  test('initializes configured servers as pending and deduplicates config errors', async () => {
    const error: PluginError = {
      type: 'mcp-config-invalid',
      source: 'plugin',
      plugin: 'broken',
      serverName: 'bad',
      validationError: 'invalid',
    }
    const disabledConfig = stdioConfig('user')
    const harness = createHarness({
      dynamicMcpConfig: {
        dynamic: stdioConfig('dynamic'),
      },
      deps: {
        getClaudeCodeMcpConfigs: mock(async () => ({
          servers: {
            configured: stdioConfig('project'),
            disabled: disabledConfig,
          },
          errors: [error],
        })),
        isMcpServerDisabled: mock((name: string) => name === 'disabled'),
      },
    })

    await harness.service.initializeServersAsPending()
    await harness.service.initializeServersAsPending()

    expect(harness.appState.mcp.clients).toMatchObject([
      { name: 'configured', type: 'pending' },
      { name: 'disabled', type: 'disabled' },
      { name: 'dynamic', type: 'pending' },
    ])
    expect(harness.appState.plugins.errors).toEqual([error])
  })

  test('cleans stale clients and cancels stale reconnect timers during initialization', async () => {
    const connected = createConnectedClient('old', stdioConfig('dynamic'))
    const failed: MCPServerConnection = {
      name: 'failed-old',
      type: 'failed',
      config: stdioConfig('dynamic'),
    }
    const timer = setTimeout(() => {}, 60_000)
    const failedTimer = setTimeout(() => {}, 60_000)
    const harness = createHarness({
      appState: createAppState([connected, failed]),
      deps: {
        excludeStalePluginClients: mock((mcp, _configs) => ({
          clients: [],
          tools: [],
          commands: [],
          resources: {},
          stale: [connected, failed],
        })),
      },
    })
    harness.reconnectTimers.set('old', timer)
    harness.reconnectTimers.set('failed-old', failedTimer)

    await harness.service.initializeServersAsPending()

    expect(harness.reconnectTimers.size).toBe(0)
    expect(connected.client.onclose).toBeUndefined()
    expect(harness.deps.clearServerCache).toHaveBeenCalledTimes(1)
    expect(harness.deps.clearServerCache).toHaveBeenCalledWith(
      'old',
      connected.config,
    )
    expect(harness.appState.mcp.clients).toEqual([])
  })

  test('connects local configs first, then adds and connects claude.ai configs', async () => {
    const connectCalls: Array<Record<string, ScopedMcpServerConfig>> = []
    const harness = createHarness({
      deps: {
        getClaudeCodeMcpConfigs: mock(async () => ({
          servers: {
            local: stdioConfig('project'),
            disabled: stdioConfig('user'),
          },
          errors: [],
        })),
        fetchClaudeAIMcpConfigsIfEligible: mock(async () => ({
          cloud: httpConfig('claudeai'),
        })),
        isMcpServerDisabled: mock((name: string) => name === 'disabled'),
        getMcpToolsCommandsAndResources: mock(
          async (
            _onConnectionAttempt: (
              attempt: RuntimeMcpConnectionAttempt,
            ) => void,
            configs?: Record<string, ScopedMcpServerConfig>,
          ) => {
            connectCalls.push(configs ?? {})
          },
        ),
      },
    })

    await harness.service.connectConfiguredServers()

    expect(Object.keys(connectCalls[0] ?? {})).toEqual(['local'])
    expect(Object.keys(connectCalls[1] ?? {})).toEqual(['cloud'])
    expect(harness.appState.mcp.clients).toMatchObject([
      { name: 'cloud', type: 'pending' },
    ])
    expect(harness.deps.logEvent).toHaveBeenCalledWith('tengu_mcp_servers', {
      enterprise: 0,
      global: 1,
      project: 1,
      user: 0,
      plugin: 0,
      claudeai: 1,
    })
  })

  test('manual reconnect cancels pending timers and forwards the connection attempt', async () => {
    const config = httpConfig()
    const appState = createAppState([
      {
        name: 'remote',
        type: 'failed',
        config,
      },
    ])
    const timer = setTimeout(() => {}, 60_000)
    const reconnectResult = createAttempt({
      name: 'remote',
      type: 'failed',
      config,
    })
    const harness = createHarness({
      appState,
      deps: {
        reconnectMcpServerImpl: mock(async () => reconnectResult),
      },
    })
    harness.reconnectTimers.set('remote', timer)

    const result = await harness.service.reconnectServer('remote')

    expect(result).toBe(reconnectResult)
    expect(harness.reconnectTimers.has('remote')).toBe(false)
    expect(harness.attempts).toEqual([reconnectResult])
  })

  test('disables connected servers before clearing their connection cache', async () => {
    const calls: string[] = []
    const config = httpConfig()
    const harness = createHarness({
      appState: createAppState([createConnectedClient('remote', config)]),
      deps: {
        setMcpServerEnabled: mock((name: string, enabled: boolean) => {
          calls.push(`${name}:${enabled}`)
        }),
        clearServerCache: mock(async () => {
          calls.push('clear-cache')
        }),
      },
    })

    await harness.service.toggleServerEnabled('remote')

    expect(calls).toEqual(['remote:false', 'clear-cache'])
    expect(harness.updates).toMatchObject([
      { name: 'remote', type: 'disabled' },
    ])
  })

  test('enables disabled servers as pending before reconnecting', async () => {
    const calls: string[] = []
    const config = httpConfig()
    const reconnectResult = createAttempt(
      createConnectedClient('remote', config),
    )
    const harness = createHarness({
      appState: createAppState([
        {
          name: 'remote',
          type: 'disabled',
          config,
        },
      ]),
      deps: {
        setMcpServerEnabled: mock((name: string, enabled: boolean) => {
          calls.push(`${name}:${enabled}`)
        }),
        reconnectMcpServerImpl: mock(async () => reconnectResult),
      },
    })

    await harness.service.toggleServerEnabled('remote')

    expect(calls).toEqual(['remote:true'])
    expect(harness.updates[0]).toMatchObject({
      name: 'remote',
      type: 'pending',
    })
    expect(harness.attempts).toEqual([reconnectResult])
  })

  test('handles closed remote connections through runtime-owned reconnect backoff', async () => {
    const config = httpConfig()
    const reconnected = createAttempt(createConnectedClient('remote', config))
    const harness = createHarness({
      deps: {
        reconnectMcpServerImpl: mock(async () => reconnected),
      },
    })

    await harness.service.handleConnectedClientClosed(
      createConnectedClient('remote', config),
    )

    expect(harness.updates[0]).toMatchObject({
      name: 'remote',
      type: 'pending',
      reconnectAttempt: 1,
      maxReconnectAttempts: 5,
    })
    expect(harness.attempts).toEqual([reconnected])
  })

  test('registers channel handlers and routes channel events through host callbacks', async () => {
    const client = createConnectedClient('channel-server', httpConfig(), {
      experimental: {
        'claude/channel': {},
        'claude/channel/permission': {},
      },
    })
    const harness = createHarness({
      getAllowedChannels: mock(() => [
        { kind: 'server', name: 'channel-server' },
      ] as const),
    })

    harness.service.handleConnectionAttempt(createAttempt(client))

    const mcpClient = getMockMcpClient(client)
    expect(harness.elicitationRegistrations).toEqual(['channel-server'])
    expect(mcpClient.setNotificationHandler).toHaveBeenCalledTimes(2)

    const channelHandler = mcpClient.setNotificationHandler.mock.calls[0]![1] as (
      notification: {
        params: { content: string; meta?: Record<string, string> }
      },
    ) => Promise<void>
    await channelHandler({
      params: {
        content: 'hello',
        meta: { chat_id: 'c1' },
      },
    })

    const permissionHandler = mcpClient.setNotificationHandler.mock
      .calls[1]![1] as (notification: {
      params: { request_id: string; behavior: 'allow' | 'deny' }
    }) => Promise<void>
    await permissionHandler({
      params: {
        request_id: 'abcde',
        behavior: 'allow',
      },
    })

    expect(harness.channelMessages).toEqual([
      {
        serverName: 'channel-server',
        content: 'hello',
        meta: { chat_id: 'c1' },
      },
    ])
    expect(harness.channelPermissionResolutions).toEqual([
      {
        requestId: 'abcde',
        behavior: 'allow',
        serverName: 'channel-server',
      },
    ])
  })

  test('tears down skipped channel handlers and deduplicates blocked notifications', () => {
    const client = createConnectedClient(
      'plugin:slack:local',
      {
        ...httpConfig(),
        pluginSource: 'slack@evil',
      },
      {
        experimental: {
          'claude/channel': {},
        },
      },
    )
    const harness = createHarness({
      getAllowedChannels: mock(() => [
        {
          kind: 'plugin',
          name: 'slack',
          marketplace: 'anthropic',
        },
      ] as const),
    })

    harness.service.handleConnectionAttempt(createAttempt(client))
    harness.service.handleConnectionAttempt(createAttempt(client))

    const mcpClient = getMockMcpClient(client)
    expect(mcpClient.removeNotificationHandler).toHaveBeenCalledTimes(4)
    expect(harness.channelBlockedNotifications).toHaveLength(1)
    expect(harness.channelBlockedNotifications[0]?.kind).toBe('marketplace')
  })

  test('refreshes tools after tools/list_changed and records previous count', async () => {
    const oldTool = { name: 'mcp__server__old' } as unknown as Tool
    const newTool = { name: 'mcp__server__new' } as unknown as Tool
    const fetchTools = createCachedAsync(async () => [newTool])
    fetchTools.cache.set('server', Promise.resolve([oldTool]))
    const client = createConnectedClient('server', httpConfig(), {
      tools: { listChanged: true },
    })
    const harness = createHarness({
      deps: {
        fetchToolsForClient: fetchTools,
      },
    })

    harness.service.handleConnectionAttempt(createAttempt(client))
    const handler = getMockMcpClient(client).setNotificationHandler.mock
      .calls[0]![1] as () => Promise<void>
    await handler()
    await Promise.resolve()

    expect(fetchTools.cache.has('server')).toBe(false)
    expect(harness.updates).toContainEqual({ ...client, tools: [newTool] })
    expect(harness.deps.logEvent).toHaveBeenCalledWith(
      'tengu_mcp_list_changed',
      {
        type: 'tools',
        previousCount: 1,
        newCount: 1,
      },
    )
  })

  test('refreshes prompts after prompts/list_changed', async () => {
    const command = { name: 'prompt' } as unknown as Command
    const fetchCommands = createCachedAsync(async () => [command])
    fetchCommands.cache.set('server', Promise.resolve([]))
    const client = createConnectedClient('server', httpConfig(), {
      prompts: { listChanged: true },
    })
    const harness = createHarness({
      deps: {
        fetchCommandsForClient: fetchCommands,
      },
    })

    harness.service.handleConnectionAttempt(createAttempt(client))
    const handler = getMockMcpClient(client).setNotificationHandler.mock
      .calls[0]![1] as () => Promise<void>
    await handler()

    expect(fetchCommands.cache.has('server')).toBe(false)
    expect(harness.updates).toContainEqual({ ...client, commands: [command] })
  })

  test('refreshes resources after resources/list_changed', async () => {
    const resource = {
      server: 'server',
      uri: 'file:///tmp/resource',
      name: 'resource',
    } as unknown as ServerResource
    const fetchResources = createCachedAsync(async () => [resource])
    fetchResources.cache.set('server', Promise.resolve([]))
    const client = createConnectedClient('server', httpConfig(), {
      resources: { listChanged: true },
    })
    const harness = createHarness({
      deps: {
        fetchResourcesForClient: fetchResources,
      },
    })

    harness.service.handleConnectionAttempt(createAttempt(client))
    const handler = getMockMcpClient(client).setNotificationHandler.mock
      .calls[0]![1] as () => Promise<void>
    await handler()

    expect(fetchResources.cache.has('server')).toBe(false)
    expect(harness.updates).toContainEqual({
      ...client,
      resources: [resource],
    })
  })
})
