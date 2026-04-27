import type { KernelRuntimeWireMcpRegistry } from '../runtime/core/wire/KernelRuntimeWireRouter.js'
import type {
  RuntimeMcpConnectionState,
  RuntimeMcpLifecycleResult,
  RuntimeMcpServerRef,
  RuntimeMcpTransport,
} from '../runtime/contracts/mcp.js'
import type { MCPServerConnection } from '../services/mcp/types.js'
import type { ScopedMcpServerConfig } from '../services/mcp/types.js'

export function createDefaultKernelRuntimeMcpRegistry(
  _workspacePath: string | undefined,
): KernelRuntimeWireMcpRegistry {
  let cachedServers: readonly RuntimeMcpServerRef[] | undefined

  async function listServers(): Promise<readonly RuntimeMcpServerRef[]> {
    if (!cachedServers) {
      const { getClaudeCodeMcpConfigs, isMcpServerDisabled } = await import(
        '../services/mcp/config.js'
      )
      const { servers } = await getClaudeCodeMcpConfigs()
      cachedServers = Object.entries(servers).map(([name, config]) =>
        toConfiguredMcpServerRef(name, config, isMcpServerDisabled(name)),
      )
    }
    return cachedServers
  }

  async function getServerConfig(
    serverName: string,
  ): Promise<ScopedMcpServerConfig | undefined> {
    const { getClaudeCodeMcpConfigs } = await import(
      '../services/mcp/config.js'
    )
    const { servers } = await getClaudeCodeMcpConfigs()
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

    const { reconnectMcpServerImpl } = await import('../services/mcp/client.js')
    const attempt = await reconnectMcpServerImpl(request.serverName, config)
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

    const { setMcpServerEnabled } = await import('../services/mcp/config.js')
    setMcpServerEnabled(request.serverName, request.enabled)

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

  return {
    listServers,
    listResources: () => [],
    listToolBindings: () => [],
    async reload() {
      cachedServers = undefined
      await listServers()
    },
    connectServer,
    setServerEnabled,
  }
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
