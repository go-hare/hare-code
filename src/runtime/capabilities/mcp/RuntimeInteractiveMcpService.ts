import { feature } from 'bun:bundle'
import { basename } from 'path'
import {
  PromptListChangedNotificationSchema,
  ResourceListChangedNotificationSchema,
  ToolListChangedNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js'
import type { Command } from '../../../commands.js'
import {
  clearServerCache,
  fetchCommandsForClient,
  fetchResourcesForClient,
  fetchToolsForClient,
  getMcpToolsCommandsAndResources,
  reconnectMcpServerImpl,
} from '../../../services/mcp/client.js'
import {
  clearClaudeAIMcpConfigsCache,
  fetchClaudeAIMcpConfigsIfEligible,
} from '../../../services/mcp/claudeai.js'
import {
  dedupClaudeAiMcpServers,
  doesEnterpriseMcpConfigExist,
  filterMcpServersByPolicy,
  getClaudeCodeMcpConfigs,
  isMcpServerDisabled,
  setMcpServerEnabled,
} from '../../../services/mcp/config.js'
import {
  CHANNEL_PERMISSION_METHOD,
  ChannelMessageNotificationSchema,
  ChannelPermissionNotificationSchema,
  findChannelEntry,
  gateChannelServer,
} from '../../../services/mcp/channelNotification.js'
import type {
  ConnectedMCPServer,
  MCPServerConnection,
  ScopedMcpServerConfig,
  ServerResource,
} from '../../../services/mcp/types.js'
import { excludeStalePluginClients } from '../../../services/mcp/utils.js'
import type { AppState } from '../../../state/AppState.js'
import type { Tool } from '../../../Tool.js'
import type { PluginError } from '../../../types/plugin.js'
import { logForDebugging } from '../../../utils/debug.js'
import { errorMessage } from '../../../utils/errors.js'
import { logMCPDebug, logMCPError } from '../../../utils/log.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../../services/analytics/index.js'

/* eslint-disable @typescript-eslint/no-require-imports */
const fetchMcpSkillsForClient = feature('MCP_SKILLS')
  ? (
      require('../../../skills/mcpSkills.js') as typeof import('../../../skills/mcpSkills.js')
    ).fetchMcpSkillsForClient
  : null
const clearSkillIndexCache = feature('EXPERIMENTAL_SKILL_SEARCH')
  ? (
      require('../../../services/skillSearch/localSearch.js') as typeof import('../../../services/skillSearch/localSearch.js')
    ).clearSkillIndexCache
  : null
/* eslint-enable @typescript-eslint/no-require-imports */

const MAX_RECONNECT_ATTEMPTS = 5
const INITIAL_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 30000

export type RuntimeMcpServerUpdate = MCPServerConnection & {
  tools?: Tool[]
  commands?: Command[]
  resources?: ServerResource[]
}

export type RuntimeMcpConnectionAttempt = {
  client: MCPServerConnection
  tools: Tool[]
  commands: Command[]
  resources?: ServerResource[]
}

type SetAppState = (updater: (prev: AppState) => AppState) => void
export type RuntimeMcpChannelBlockedKind =
  | 'disabled'
  | 'auth'
  | 'policy'
  | 'marketplace'
  | 'allowlist'

export type RuntimeInteractiveMcpServiceOptions = {
  getAppState(): AppState
  setAppState: SetAppState
  getAllowedChannels?: () => Parameters<typeof gateChannelServer>[3]
  dynamicMcpConfig?: Record<string, ScopedMcpServerConfig>
  isStrictMcpConfig?: boolean
  reconnectTimers: Map<string, ReturnType<typeof setTimeout>>
  updateServer(update: RuntimeMcpServerUpdate): void
  onConnectionAttempt?(attempt: RuntimeMcpConnectionAttempt): void
  registerElicitationHandler?(client: ConnectedMCPServer): void
  enqueueChannelMessage?(input: {
    serverName: string
    content: string
    meta?: Record<string, string>
  }): void
  resolveChannelPermission?(input: {
    requestId: string
    behavior: 'allow' | 'deny'
    serverName: string
  }): boolean
  notifyChannelBlocked?(input: {
    kind: RuntimeMcpChannelBlockedKind
    text: string
  }): void
  channelWarnedKinds?: Set<RuntimeMcpChannelBlockedKind>
}

export type RuntimeInteractiveMcpService = {
  handleConnectionAttempt(attempt: RuntimeMcpConnectionAttempt): void
  initializeServersAsPending(): Promise<void>
  connectConfiguredServers(options?: {
    isCancelled?: () => boolean
  }): Promise<void>
  handleConnectedClientClosed(client: MCPServerConnection): Promise<void>
  reconnectServer(serverName: string): Promise<RuntimeMcpConnectionAttempt>
  toggleServerEnabled(serverName: string): Promise<void>
}

export type RuntimeInteractiveMcpServiceDeps = {
  getClaudeCodeMcpConfigs: typeof getClaudeCodeMcpConfigs
  clearClaudeAIMcpConfigsCache: typeof clearClaudeAIMcpConfigsCache
  fetchClaudeAIMcpConfigsIfEligible: typeof fetchClaudeAIMcpConfigsIfEligible
  doesEnterpriseMcpConfigExist: typeof doesEnterpriseMcpConfigExist
  filterMcpServersByPolicy: typeof filterMcpServersByPolicy
  dedupClaudeAiMcpServers: typeof dedupClaudeAiMcpServers
  getMcpToolsCommandsAndResources: typeof getMcpToolsCommandsAndResources
  fetchToolsForClient: typeof fetchToolsForClient
  fetchCommandsForClient: typeof fetchCommandsForClient
  fetchResourcesForClient: typeof fetchResourcesForClient
  fetchMcpSkillsForClient: typeof fetchMcpSkillsForClient
  clearSkillIndexCache: typeof clearSkillIndexCache
  reconnectMcpServerImpl: typeof reconnectMcpServerImpl
  clearServerCache: typeof clearServerCache
  isMcpServerDisabled: typeof isMcpServerDisabled
  setMcpServerEnabled: typeof setMcpServerEnabled
  excludeStalePluginClients: typeof excludeStalePluginClients
  logForDebugging: typeof logForDebugging
  logEvent: typeof logEvent
  logMCPDebug: typeof logMCPDebug
  logMCPError: typeof logMCPError
}

const defaultDeps: RuntimeInteractiveMcpServiceDeps = {
  getClaudeCodeMcpConfigs,
  clearClaudeAIMcpConfigsCache,
  fetchClaudeAIMcpConfigsIfEligible,
  doesEnterpriseMcpConfigExist,
  filterMcpServersByPolicy,
  dedupClaudeAiMcpServers,
  getMcpToolsCommandsAndResources,
  fetchToolsForClient,
  fetchCommandsForClient,
  fetchResourcesForClient,
  fetchMcpSkillsForClient,
  clearSkillIndexCache,
  reconnectMcpServerImpl,
  clearServerCache,
  isMcpServerDisabled,
  setMcpServerEnabled,
  excludeStalePluginClients,
  logForDebugging,
  logEvent,
  logMCPDebug,
  logMCPError,
}

export function createRuntimeInteractiveMcpService(
  options: RuntimeInteractiveMcpServiceOptions,
  deps: RuntimeInteractiveMcpServiceDeps = defaultDeps,
): RuntimeInteractiveMcpService {
  const isStrictMcpConfig = options.isStrictMcpConfig ?? false
  const channelWarnedKinds =
    options.channelWarnedKinds ?? new Set<RuntimeMcpChannelBlockedKind>()

  function handleConnectionAttempt(
    attempt: RuntimeMcpConnectionAttempt,
  ): void {
    options.onConnectionAttempt?.(attempt)
    options.updateServer({
      ...attempt.client,
      tools: attempt.tools,
      commands: attempt.commands,
      resources: attempt.resources,
    })

    if (attempt.client.type !== 'connected') return

    options.registerElicitationHandler?.(attempt.client)
    attempt.client.client.onclose = () => {
      void handleConnectedClientClosed(attempt.client).catch(error => {
        deps.logMCPError(
          attempt.client.name,
          `Failed to handle MCP client close: ${errorMessage(error)}`,
        )
      })
    }

    registerChannelHandlers(attempt.client)
    registerListChangedHandlers(attempt.client)
  }

  async function initializeServersAsPending(): Promise<void> {
    const { servers: existingConfigs, errors: mcpErrors } = isStrictMcpConfig
      ? { servers: {}, errors: [] }
      : await deps.getClaudeCodeMcpConfigs(options.dynamicMcpConfig)
    const configs = { ...existingConfigs, ...options.dynamicMcpConfig }

    addErrorsToAppState(options.setAppState, mcpErrors)

    options.setAppState(prevState => {
      const { stale, ...mcpWithoutStale } = deps.excludeStalePluginClients(
        prevState.mcp,
        configs,
      )

      for (const staleClient of stale) {
        const timer = options.reconnectTimers.get(staleClient.name)
        if (timer) {
          clearTimeout(timer)
          options.reconnectTimers.delete(staleClient.name)
        }
        if (staleClient.type === 'connected') {
          staleClient.client.onclose = undefined
          void deps
            .clearServerCache(staleClient.name, staleClient.config)
            .catch(() => {})
        }
      }

      const existingServerNames = new Set(
        mcpWithoutStale.clients.map(client => client.name),
      )
      const newClients = Object.entries(configs)
        .filter(([name]) => !existingServerNames.has(name))
        .map(([name, config]) => ({
          name,
          type: deps.isMcpServerDisabled(name)
            ? ('disabled' as const)
            : ('pending' as const),
          config,
        }))

      if (newClients.length === 0 && stale.length === 0) {
        return prevState
      }

      return {
        ...prevState,
        mcp: {
          ...prevState.mcp,
          ...mcpWithoutStale,
          clients: [...mcpWithoutStale.clients, ...newClients],
        },
      }
    })
  }

  async function connectConfiguredServers(connectOptions: {
    isCancelled?: () => boolean
  } = {}): Promise<void> {
    const isCancelled = connectOptions.isCancelled ?? (() => false)
    let claudeaiPromise: Promise<Record<string, ScopedMcpServerConfig>>
    if (isStrictMcpConfig || deps.doesEnterpriseMcpConfigExist()) {
      claudeaiPromise = Promise.resolve({})
    } else {
      deps.clearClaudeAIMcpConfigsCache()
      claudeaiPromise = deps.fetchClaudeAIMcpConfigsIfEligible()
    }

    const { servers: claudeCodeConfigs, errors: mcpErrors } =
      isStrictMcpConfig
        ? { servers: {}, errors: [] }
        : await deps.getClaudeCodeMcpConfigs(
            options.dynamicMcpConfig,
            claudeaiPromise,
          )
    if (isCancelled()) return

    addErrorsToAppState(options.setAppState, mcpErrors)

    const configs = { ...claudeCodeConfigs, ...options.dynamicMcpConfig }
    connectEnabledConfigs(configs, 'useManageMcpConnections')

    let claudeaiConfigs: Record<string, ScopedMcpServerConfig> = {}
    if (!isStrictMcpConfig) {
      claudeaiConfigs = deps.filterMcpServersByPolicy(
        await claudeaiPromise,
      ).allowed
      if (isCancelled()) return

      if (Object.keys(claudeaiConfigs).length > 0) {
        const { servers: dedupedClaudeAi } = deps.dedupClaudeAiMcpServers(
          claudeaiConfigs,
          configs,
        )
        claudeaiConfigs = dedupedClaudeAi
      }

      if (Object.keys(claudeaiConfigs).length > 0) {
        addPendingClients(claudeaiConfigs)
        connectEnabledConfigs(claudeaiConfigs, 'useManageMcpConnections')
      }
    }

    logServerCounts({ ...configs, ...claudeaiConfigs })
  }

  async function handleConnectedClientClosed(
    client: MCPServerConnection,
  ): Promise<void> {
    if (client.type !== 'connected') return
    const configType = client.config.type ?? 'stdio'

    deps.clearServerCache(client.name, client.config).catch(() => {
      deps.logForDebugging(
        `Failed to invalidate the server cache: ${client.name}`,
      )
    })

    if (deps.isMcpServerDisabled(client.name)) {
      deps.logMCPDebug(
        client.name,
        `Server is disabled, skipping automatic reconnection`,
      )
      return
    }

    if (configType !== 'stdio' && configType !== 'sdk') {
      await reconnectWithBackoff(client, getTransportDisplayName(configType))
    } else {
      options.updateServer({ ...client, type: 'failed' })
    }
  }

  async function reconnectServer(
    serverName: string,
  ): Promise<RuntimeMcpConnectionAttempt> {
    const client = options
      .getAppState()
      .mcp.clients.find(candidate => candidate.name === serverName)
    if (!client) {
      throw new Error(`MCP server ${serverName} not found`)
    }

    cancelReconnectTimer(serverName)

    const result = await deps.reconnectMcpServerImpl(serverName, client.config)
    handleConnectionAttempt(result)
    return result
  }

  async function toggleServerEnabled(serverName: string): Promise<void> {
    const client = options
      .getAppState()
      .mcp.clients.find(candidate => candidate.name === serverName)
    if (!client) {
      throw new Error(`MCP server ${serverName} not found`)
    }

    const isCurrentlyDisabled = client.type === 'disabled'

    if (!isCurrentlyDisabled) {
      cancelReconnectTimer(serverName)
      deps.setMcpServerEnabled(serverName, false)

      if (client.type === 'connected') {
        await deps.clearServerCache(serverName, client.config)
      }

      options.updateServer({
        name: serverName,
        type: 'disabled',
        config: client.config,
      })
      return
    }

    deps.setMcpServerEnabled(serverName, true)
    options.updateServer({
      name: serverName,
      type: 'pending',
      config: client.config,
    })
    const result = await deps.reconnectMcpServerImpl(serverName, client.config)
    handleConnectionAttempt(result)
  }

  function connectEnabledConfigs(
    configs: Record<string, ScopedMcpServerConfig>,
    label: string,
  ): void {
    const enabledConfigs = Object.fromEntries(
      Object.entries(configs).filter(
        ([name]) => !deps.isMcpServerDisabled(name),
      ),
    )
    deps
      .getMcpToolsCommandsAndResources(
        handleConnectionAttempt,
        enabledConfigs,
      )
      .catch(error => {
        deps.logMCPError(
          label,
          `Failed to get MCP resources: ${errorMessage(error)}`,
        )
      })
  }

  function addPendingClients(
    configs: Record<string, ScopedMcpServerConfig>,
  ): void {
    options.setAppState(prevState => {
      const existingServerNames = new Set(
        prevState.mcp.clients.map(client => client.name),
      )
      const newClients = Object.entries(configs)
        .filter(([name]) => !existingServerNames.has(name))
        .map(([name, config]) => ({
          name,
          type: deps.isMcpServerDisabled(name)
            ? ('disabled' as const)
            : ('pending' as const),
          config,
        }))
      if (newClients.length === 0) return prevState
      return {
        ...prevState,
        mcp: {
          ...prevState.mcp,
          clients: [...prevState.mcp.clients, ...newClients],
        },
      }
    })
  }

  async function reconnectWithBackoff(
    client: Extract<MCPServerConnection, { type: 'connected' }>,
    transportType: string,
  ): Promise<void> {
    deps.logMCPDebug(
      client.name,
      `${transportType} transport closed/disconnected, attempting automatic reconnection`,
    )
    cancelReconnectTimer(client.name)

    for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
      if (deps.isMcpServerDisabled(client.name)) {
        deps.logMCPDebug(
          client.name,
          `Server disabled during reconnection, stopping retry`,
        )
        options.reconnectTimers.delete(client.name)
        return
      }

      options.updateServer({
        ...client,
        type: 'pending',
        reconnectAttempt: attempt,
        maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
      })

      const reconnectStartTime = Date.now()
      try {
        const result = await deps.reconnectMcpServerImpl(
          client.name,
          client.config,
        )
        const elapsed = Date.now() - reconnectStartTime

        if (result.client.type === 'connected') {
          deps.logMCPDebug(
            client.name,
            `${transportType} reconnection successful after ${elapsed}ms (attempt ${attempt})`,
          )
          options.reconnectTimers.delete(client.name)
          handleConnectionAttempt(result)
          return
        }

        deps.logMCPDebug(
          client.name,
          `${transportType} reconnection attempt ${attempt} completed with status: ${result.client.type}`,
        )

        if (attempt === MAX_RECONNECT_ATTEMPTS) {
          deps.logMCPDebug(
            client.name,
            `Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached, giving up`,
          )
          options.reconnectTimers.delete(client.name)
          handleConnectionAttempt(result)
          return
        }
      } catch (error) {
        const elapsed = Date.now() - reconnectStartTime
        deps.logMCPError(
          client.name,
          `${transportType} reconnection attempt ${attempt} failed after ${elapsed}ms: ${error}`,
        )

        if (attempt === MAX_RECONNECT_ATTEMPTS) {
          deps.logMCPDebug(
            client.name,
            `Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached, giving up`,
          )
          options.reconnectTimers.delete(client.name)
          options.updateServer({ ...client, type: 'failed' })
          return
        }
      }

      const backoffMs = Math.min(
        INITIAL_BACKOFF_MS * 2 ** (attempt - 1),
        MAX_BACKOFF_MS,
      )
      deps.logMCPDebug(
        client.name,
        `Scheduling reconnection attempt ${attempt + 1} in ${backoffMs}ms`,
      )
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, backoffMs)
        options.reconnectTimers.set(client.name, timer)
      })
    }
  }

  function registerChannelHandlers(client: ConnectedMCPServer): void {
    const channels = options.getAllowedChannels?.() ?? []
    const gate = gateChannelServer(
      client.name,
      client.capabilities,
      client.config.pluginSource,
      channels,
    )
    const entry = findChannelEntry(client.name, channels)
    const pluginId =
      entry?.kind === 'plugin'
        ? (`${entry.name}@${entry.marketplace}` as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS)
        : undefined

    if (gate.action === 'register' || gate.kind !== 'capability') {
      deps.logEvent('tengu_mcp_channel_gate', {
        registered: gate.action === 'register',
        skip_kind:
          gate.action === 'skip'
            ? (gate.kind as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS)
            : undefined,
        entry_kind:
          entry?.kind as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        is_dev: entry?.dev ?? false,
        plugin: pluginId,
      })
    }

    switch (gate.action) {
      case 'register':
        deps.logMCPDebug(client.name, 'Channel notifications registered')
        client.client.setNotificationHandler(
          ChannelMessageNotificationSchema(),
          async notification => {
            const { content, meta } = notification.params
            deps.logMCPDebug(
              client.name,
              `notifications/claude/channel: ${content.slice(0, 80)}`,
            )
            deps.logEvent('tengu_mcp_channel_message', {
              content_length: content.length,
              meta_key_count: Object.keys(meta ?? {}).length,
              entry_kind:
                entry?.kind as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              is_dev: entry?.dev ?? false,
              plugin: pluginId,
            })
            options.enqueueChannelMessage?.({
              serverName: client.name,
              content,
              meta,
            })
          },
        )
        if (client.capabilities?.experimental?.['claude/channel/permission']) {
          client.client.setNotificationHandler(
            ChannelPermissionNotificationSchema(),
            async notification => {
              const { request_id, behavior } = notification.params
              const resolved =
                options.resolveChannelPermission?.({
                  requestId: request_id,
                  behavior,
                  serverName: client.name,
                }) ?? false
              deps.logMCPDebug(
                client.name,
                `notifications/claude/channel/permission: ${request_id} → ${behavior} (${resolved ? 'matched pending' : 'no pending entry — stale or unknown ID'})`,
              )
            },
          )
        }
        break
      case 'skip':
        client.client.removeNotificationHandler('notifications/claude/channel')
        client.client.removeNotificationHandler(CHANNEL_PERMISSION_METHOD)
        deps.logMCPDebug(
          client.name,
          `Channel notifications skipped: ${gate.reason}`,
        )
        if (
          isUserVisibleChannelSkip(gate.kind) &&
          !channelWarnedKinds.has(gate.kind) &&
          (gate.kind === 'marketplace' ||
            gate.kind === 'allowlist' ||
            entry !== undefined)
        ) {
          channelWarnedKinds.add(gate.kind)
          options.notifyChannelBlocked?.({
            kind: gate.kind,
            text: channelBlockedNotificationText(gate.kind, gate.reason),
          })
        }
        break
    }
  }

  function registerListChangedHandlers(client: ConnectedMCPServer): void {
    if (client.capabilities?.tools?.listChanged) {
      client.client.setNotificationHandler(
        ToolListChangedNotificationSchema,
        async () => {
          deps.logMCPDebug(
            client.name,
            `Received tools/list_changed notification, refreshing tools`,
          )
          try {
            const previousToolsPromise = deps.fetchToolsForClient.cache.get(
              client.name,
            )
            deps.fetchToolsForClient.cache.delete(client.name)
            const newTools = await deps.fetchToolsForClient(client)
            const newCount = newTools.length
            if (previousToolsPromise) {
              previousToolsPromise.then(
                (previousTools: Tool[]) => {
                  deps.logEvent('tengu_mcp_list_changed', {
                    type: 'tools' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                    previousCount: previousTools.length,
                    newCount,
                  })
                },
                () => {
                  deps.logEvent('tengu_mcp_list_changed', {
                    type: 'tools' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                    newCount,
                  })
                },
              )
            } else {
              deps.logEvent('tengu_mcp_list_changed', {
                type: 'tools' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                newCount,
              })
            }
            options.updateServer({ ...client, tools: newTools })
          } catch (error) {
            deps.logMCPError(
              client.name,
              `Failed to refresh tools after list_changed notification: ${errorMessage(error)}`,
            )
          }
        },
      )
    }

    if (client.capabilities?.prompts?.listChanged) {
      client.client.setNotificationHandler(
        PromptListChangedNotificationSchema,
        async () => {
          deps.logMCPDebug(
            client.name,
            `Received prompts/list_changed notification, refreshing prompts`,
          )
          deps.logEvent('tengu_mcp_list_changed', {
            type: 'prompts' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          })
          try {
            deps.fetchCommandsForClient.cache.delete(client.name)
            const [mcpPrompts, mcpSkills] = await Promise.all([
              deps.fetchCommandsForClient(client),
              feature('MCP_SKILLS')
                ? (deps.fetchMcpSkillsForClient?.(client) ??
                  Promise.resolve([]))
                : Promise.resolve([]),
            ])
            options.updateServer({
              ...client,
              commands: [...mcpPrompts, ...mcpSkills],
            })
            deps.clearSkillIndexCache?.()
          } catch (error) {
            deps.logMCPError(
              client.name,
              `Failed to refresh prompts after list_changed notification: ${errorMessage(error)}`,
            )
          }
        },
      )
    }

    if (client.capabilities?.resources?.listChanged) {
      client.client.setNotificationHandler(
        ResourceListChangedNotificationSchema,
        async () => {
          deps.logMCPDebug(
            client.name,
            `Received resources/list_changed notification, refreshing resources`,
          )
          deps.logEvent('tengu_mcp_list_changed', {
            type: 'resources' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          })
          try {
            deps.fetchResourcesForClient.cache.delete(client.name)
            if (feature('MCP_SKILLS')) {
              if (deps.fetchMcpSkillsForClient) {
                deps.fetchMcpSkillsForClient.cache.delete(client.name)
                deps.fetchCommandsForClient.cache.delete(client.name)
                const [newResources, mcpPrompts, mcpSkills] =
                  await Promise.all([
                    deps.fetchResourcesForClient(client),
                    deps.fetchCommandsForClient(client),
                    deps.fetchMcpSkillsForClient(client),
                  ])
                options.updateServer({
                  ...client,
                  resources: newResources,
                  commands: [...mcpPrompts, ...mcpSkills],
                })
                deps.clearSkillIndexCache?.()
                return
              }
            }
            const newResources = await deps.fetchResourcesForClient(client)
            options.updateServer({ ...client, resources: newResources })
          } catch (error) {
            deps.logMCPError(
              client.name,
              `Failed to refresh resources after list_changed notification: ${errorMessage(error)}`,
            )
          }
        },
      )
    }
  }

  function cancelReconnectTimer(serverName: string): void {
    const existingTimer = options.reconnectTimers.get(serverName)
    if (existingTimer) {
      clearTimeout(existingTimer)
      options.reconnectTimers.delete(serverName)
    }
  }

  function logServerCounts(
    allConfigs: Record<string, ScopedMcpServerConfig>,
  ): void {
    const counts = {
      enterprise: 0,
      global: 0,
      project: 0,
      user: 0,
      plugin: 0,
      claudeai: 0,
    }
    const stdioCommands: string[] = []
    for (const [name, serverConfig] of Object.entries(allConfigs)) {
      if (serverConfig.scope === 'enterprise') counts.enterprise++
      else if (serverConfig.scope === 'user') counts.global++
      else if (serverConfig.scope === 'project') counts.project++
      else if (serverConfig.scope === 'local') counts.user++
      else if (serverConfig.scope === 'dynamic') counts.plugin++
      else if (serverConfig.scope === 'claudeai') counts.claudeai++

      if (
        process.env.USER_TYPE === 'ant' &&
        !deps.isMcpServerDisabled(name) &&
        (serverConfig.type === undefined || serverConfig.type === 'stdio') &&
        'command' in serverConfig
      ) {
        stdioCommands.push(basename(serverConfig.command))
      }
    }
    deps.logEvent('tengu_mcp_servers', {
      ...counts,
      ...(process.env.USER_TYPE === 'ant' && stdioCommands.length > 0
        ? {
            stdio_commands: stdioCommands
              .sort()
              .join(
                ',',
              ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          }
        : {}),
    })
  }

  return {
    handleConnectionAttempt,
    initializeServersAsPending,
    connectConfiguredServers,
    handleConnectedClientClosed,
    reconnectServer,
    toggleServerEnabled,
  }
}

function isUserVisibleChannelSkip(
  kind: Exclude<
    ReturnType<typeof gateChannelServer>,
    { action: 'register' }
  >['kind'],
): kind is RuntimeMcpChannelBlockedKind {
  return (
    kind === 'disabled' ||
    kind === 'auth' ||
    kind === 'policy' ||
    kind === 'marketplace' ||
    kind === 'allowlist'
  )
}

function channelBlockedNotificationText(
  kind: RuntimeMcpChannelBlockedKind,
  reason: string,
): string {
  switch (kind) {
    case 'disabled':
      return 'Channels are not currently available'
    case 'auth':
      return 'Channels require claude.ai authentication · run /login'
    case 'policy':
      return 'Channels are not enabled for your org · have an administrator set channelsEnabled: true in managed settings'
    case 'marketplace':
    case 'allowlist':
      return reason
  }
}

function addErrorsToAppState(
  setAppState: SetAppState,
  newErrors: PluginError[],
): void {
  if (newErrors.length === 0) return

  setAppState(prevState => {
    const existingKeys = new Set(
      prevState.plugins.errors.map(error => getErrorKey(error)),
    )
    const uniqueNewErrors = newErrors.filter(
      error => !existingKeys.has(getErrorKey(error)),
    )

    if (uniqueNewErrors.length === 0) {
      return prevState
    }

    return {
      ...prevState,
      plugins: {
        ...prevState.plugins,
        errors: [...prevState.plugins.errors, ...uniqueNewErrors],
      },
    }
  })
}

function getErrorKey(error: PluginError): string {
  const plugin = 'plugin' in error ? error.plugin : 'no-plugin'
  return `${error.type}:${error.source}:${plugin}`
}

function getTransportDisplayName(type: string): string {
  switch (type) {
    case 'http':
      return 'HTTP'
    case 'ws':
    case 'ws-ide':
      return 'WebSocket'
    default:
      return 'SSE'
  }
}
