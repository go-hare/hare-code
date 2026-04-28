import type { KernelRuntimeWireMcpRegistry } from '../runtime/core/wire/KernelRuntimeWireRouter.js'
import type {
  RuntimeMcpConnectionState,
  RuntimeMcpLifecycleResult,
  RuntimeMcpServerRef,
  RuntimeMcpTransport,
} from '../runtime/contracts/mcp.js'
import type { MCPServerConnection } from '../services/mcp/types.js'
import type {
  McpHTTPServerConfig,
  McpSSEServerConfig,
  ScopedMcpServerConfig,
} from '../services/mcp/types.js'

type InteractiveAuthMcpServerConfig =
  | (Omit<McpHTTPServerConfig, 'oauth'> & {
      type: 'http'
      oauth: NonNullable<McpHTTPServerConfig['oauth']>
    } & Pick<ScopedMcpServerConfig, 'scope' | 'pluginSource'>)
  | (Omit<McpSSEServerConfig, 'oauth'> & {
      type: 'sse'
      oauth: NonNullable<McpSSEServerConfig['oauth']>
    } & Pick<ScopedMcpServerConfig, 'scope' | 'pluginSource'>)

type KernelRuntimeMcpRegistryDeps = {
  getClaudeCodeMcpConfigs(): Promise<{
    servers: Record<string, ScopedMcpServerConfig>
  }>
  isMcpServerDisabled(serverName: string): Promise<boolean>
  setMcpServerEnabled(serverName: string, enabled: boolean): Promise<void>
  reconnectMcpServer(
    name: string,
    config: ScopedMcpServerConfig,
  ): Promise<{
    client: MCPServerConnection
  }>
  performOAuthFlow(
    serverName: string,
    config: ScopedMcpServerConfig,
    onAuthorizationUrl: (url: string) => void,
    abortSignal?: AbortSignal,
    options?: {
      skipBrowserOpen?: boolean
      onWaitingForCallback?: (submit: (callbackUrl: string) => void) => void
    },
  ): Promise<void>
  revokeServerTokens(
    serverName: string,
    config: ScopedMcpServerConfig,
  ): Promise<void>
  clearMcpAuthCache(): void
  isAuthFlowCancelled(error: unknown): boolean
}

const defaultDeps: KernelRuntimeMcpRegistryDeps = {
  async getClaudeCodeMcpConfigs() {
    const { getClaudeCodeMcpConfigs } = await import('../services/mcp/config.js')
    return getClaudeCodeMcpConfigs()
  },
  async isMcpServerDisabled(serverName) {
    const module = await import('../services/mcp/config.js')
    return module.isMcpServerDisabled(serverName)
  },
  async setMcpServerEnabled(serverName, enabled) {
    const module = await import('../services/mcp/config.js')
    module.setMcpServerEnabled(serverName, enabled)
  },
  async reconnectMcpServer(name, config) {
    const { reconnectMcpServerImpl } = await import('../services/mcp/client.js')
    return reconnectMcpServerImpl(name, config)
  },
  async performOAuthFlow(serverName, config, onAuthorizationUrl, abortSignal, options) {
    const { performMCPOAuthFlow } = await import('../services/mcp/auth.js')
    return performMCPOAuthFlow(
      serverName,
      asInteractiveAuthConfig(config),
      onAuthorizationUrl,
      abortSignal,
      options,
    )
  },
  async revokeServerTokens(serverName, config) {
    const { revokeServerTokens } = await import('../services/mcp/auth.js')
    return revokeServerTokens(serverName, asInteractiveAuthConfig(config))
  },
  clearMcpAuthCache() {
    void import('../services/mcp/client.js').then(module => {
      module.clearMcpAuthCache()
    })
  },
  isAuthFlowCancelled(error) {
    return (
      error instanceof Error &&
      error.name === 'AuthenticationCancelledError'
    )
  },
}

export function createDefaultKernelRuntimeMcpRegistry(
  _workspacePath: string | undefined,
  deps: KernelRuntimeMcpRegistryDeps = defaultDeps,
): KernelRuntimeWireMcpRegistry {
  let cachedServers: readonly RuntimeMcpServerRef[] | undefined

  async function listServers(): Promise<readonly RuntimeMcpServerRef[]> {
    if (!cachedServers) {
      const { servers } = await deps.getClaudeCodeMcpConfigs()
      cachedServers = await Promise.all(
        Object.entries(servers).map(async ([name, config]) =>
          toConfiguredMcpServerRef(
            name,
            config,
            await deps.isMcpServerDisabled(name),
          ),
        ),
      )
    }
    return cachedServers
  }

  async function getServerConfig(
    serverName: string,
  ): Promise<ScopedMcpServerConfig | undefined> {
    const { servers } = await deps.getClaudeCodeMcpConfigs()
    return servers[serverName]
  }

  async function connectServer(request: {
    serverName: string
    metadata?: Record<string, unknown>
  }): Promise<RuntimeMcpLifecycleResult> {
    const config = await getServerConfig(request.serverName)
    if (!config) {
      return {
        serverName: request.serverName,
        state: 'failed',
        message: `MCP server ${request.serverName} is not configured`,
        metadata: request.metadata,
      }
    }

    const attempt = await deps.reconnectMcpServer(request.serverName, config)
    const server = toConnectedMcpServerRef(attempt.client)
    cachedServers = replaceCachedServer(await listServers(), server)
    return {
      serverName: request.serverName,
      state: server.state,
      server,
      snapshot: { servers: cachedServers },
      metadata: request.metadata,
    }
  }

  async function setServerEnabled(request: {
    serverName: string
    enabled: boolean
    metadata?: Record<string, unknown>
  }): Promise<RuntimeMcpLifecycleResult> {
    const config = await getServerConfig(request.serverName)
    if (!config) {
      return {
        serverName: request.serverName,
        state: 'failed',
        message: `MCP server ${request.serverName} is not configured`,
        metadata: request.metadata,
      }
    }

    await deps.setMcpServerEnabled(request.serverName, request.enabled)

    const server = toConfiguredMcpServerRef(
      request.serverName,
      config,
      !request.enabled,
    )
    cachedServers = replaceCachedServer(await listServers(), server)
    return {
      serverName: request.serverName,
      state: server.state,
      server,
      snapshot: { servers: cachedServers },
      metadata: request.metadata,
    }
  }

  async function authenticateServer(request: {
    serverName: string
    action?: 'authenticate' | 'clear'
    callbackUrl?: string
    metadata?: Record<string, unknown>
  }): Promise<RuntimeMcpLifecycleResult> {
    const config = await getServerConfig(request.serverName)
    if (!config) {
      return {
        serverName: request.serverName,
        state: 'failed',
        message: `MCP server ${request.serverName} is not configured`,
        metadata: request.metadata,
      }
    }

    if (request.action === 'clear') {
      if (supportsInteractiveAuth(config)) {
        await deps.revokeServerTokens(request.serverName, config)
      }
      deps.clearMcpAuthCache()
      const server = toAuthPendingMcpServerRef(request.serverName, config)
      cachedServers = replaceCachedServer(await listServers(), server)
      return {
        serverName: request.serverName,
        state: server.state,
        server,
        snapshot: { servers: cachedServers },
        message: `Cleared MCP auth for ${request.serverName}`,
        metadata: request.metadata,
      }
    }

    if (!supportsInteractiveAuth(config)) {
      return connectServer(request)
    }

    if (!request.callbackUrl) {
      const authorizationUrl = await requestAuthorizationUrl(
        request.serverName,
        config,
        deps,
      )
      const server = toAuthPendingMcpServerRef(request.serverName, config)
      cachedServers = replaceCachedServer(await listServers(), server)
      return {
        serverName: request.serverName,
        state: server.state,
        server,
        snapshot: { servers: cachedServers },
        authorizationUrl,
        message:
          authorizationUrl ??
          `MCP server ${request.serverName} requires OAuth callback completion`,
        metadata: request.metadata,
      }
    }

    let authorizationUrl: string | undefined
    await deps.performOAuthFlow(
      request.serverName,
      config,
      url => {
        authorizationUrl = url
      },
      undefined,
      {
        skipBrowserOpen: true,
        onWaitingForCallback: submit => {
          submit(request.callbackUrl!)
        },
      },
    )
    deps.clearMcpAuthCache()

    const attempt = await deps.reconnectMcpServer(request.serverName, config)
    const server = toConnectedMcpServerRef(attempt.client)
    cachedServers = replaceCachedServer(await listServers(), server)
    return {
      serverName: request.serverName,
      state: server.state,
      server,
      snapshot: { servers: cachedServers },
      authorizationUrl,
      message: `Authenticated MCP server ${request.serverName}`,
      metadata: request.metadata,
    }
  }

  return {
    listServers,
    listResources: () => [],
    listToolBindings: () => [],
    async reload() {
      cachedServers = undefined
      await listServers()
    },
    connectServer,
    authenticateServer,
    setServerEnabled,
  }
}

async function requestAuthorizationUrl(
  serverName: string,
  config: ScopedMcpServerConfig,
  deps: KernelRuntimeMcpRegistryDeps,
): Promise<string | undefined> {
  const controller = new AbortController()
  let authorizationUrl: string | undefined
  try {
    await deps.performOAuthFlow(
      serverName,
      config,
      url => {
        authorizationUrl = url
        controller.abort()
      },
      controller.signal,
      { skipBrowserOpen: true },
    )
  } catch (error) {
    if (!authorizationUrl || !deps.isAuthFlowCancelled(error)) {
      throw error
    }
  }
  return authorizationUrl
}

function toConfiguredMcpServerRef(
  name: string,
  config: ScopedMcpServerConfig,
  disabled: boolean,
): RuntimeMcpServerRef {
  return {
    name,
    transport: toRuntimeMcpTransport(config.type),
    state: disabled ? 'disabled' : toConfiguredMcpConnectionState(config),
    scope: config.scope,
  }
}

function toConnectedMcpServerRef(
  connection: MCPServerConnection,
): RuntimeMcpServerRef {
  return {
    name: connection.name,
    transport: toRuntimeMcpTransport(connection.config.type),
    state: connection.type,
    scope: connection.config.scope,
    capabilities:
      connection.type === 'connected' ? connection.capabilities : undefined,
    error: connection.type === 'failed' ? connection.error : undefined,
  }
}

function replaceCachedServer(
  servers: readonly RuntimeMcpServerRef[],
  server: RuntimeMcpServerRef,
): readonly RuntimeMcpServerRef[] {
  const replaced = servers.map(existing =>
    existing.name === server.name ? server : existing,
  )
  return replaced.some(existing => existing.name === server.name)
    ? replaced
    : [...replaced, server]
}

function toRuntimeMcpTransport(
  transport: ScopedMcpServerConfig['type'],
): RuntimeMcpTransport {
  switch (transport) {
    case undefined:
      return 'stdio'
    case 'stdio':
    case 'sse':
    case 'sse-ide':
    case 'http':
    case 'ws':
    case 'ws-ide':
    case 'sdk':
    case 'claudeai-proxy':
      return transport
    default:
      return 'unknown'
  }
}

function toConfiguredMcpConnectionState(
  _config: ScopedMcpServerConfig,
): RuntimeMcpConnectionState {
  return 'pending'
}

function supportsInteractiveAuth(
  config: ScopedMcpServerConfig,
): config is InteractiveAuthMcpServerConfig {
  return (
    (config.type === 'http' || config.type === 'sse') &&
    'oauth' in config &&
    !!config.oauth
  )
}

function toAuthPendingMcpServerRef(
  name: string,
  config: ScopedMcpServerConfig,
): RuntimeMcpServerRef {
  return {
    name,
    transport: toRuntimeMcpTransport(config.type),
    state: supportsInteractiveAuth(config) ? 'needs-auth' : 'pending',
    scope: config.scope,
  }
}

function asInteractiveAuthConfig(
  config: ScopedMcpServerConfig,
): InteractiveAuthMcpServerConfig {
  if (!supportsInteractiveAuth(config)) {
    throw new Error('MCP auth flow requires an HTTP/SSE server with OAuth config')
  }
  return config
}
