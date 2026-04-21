import type { ScopedMcpServerConfig } from '../../../services/mcp/types.js'
import { count } from '../../../utils/array.js'
import { jsonStringify } from '../../../utils/slowOperations.js'

export type McpConfigEntry = [string, ScopedMcpServerConfig]

export type McpServerStats = {
  totalServers: number
  stdioCount: number
  sseCount: number
  httpCount: number
  sseIdeCount: number
  wsIdeCount: number
}

type CacheLike = {
  delete(key: string): void
}

export type McpLifecycleCaches = {
  connectionCache: CacheLike
  toolsCache: CacheLike
  resourcesCache: CacheLike
  commandsCache: CacheLike
  skillsCache?: CacheLike
}

export function getMcpServerConnectionBatchSize(): number {
  return parseInt(process.env.MCP_SERVER_CONNECTION_BATCH_SIZE || '', 10) || 3
}

export function getRemoteMcpServerConnectionBatchSize(): number {
  return (
    parseInt(process.env.MCP_REMOTE_SERVER_CONNECTION_BATCH_SIZE || '', 10) ||
    20
  )
}

export function isLocalMcpServer(config: ScopedMcpServerConfig): boolean {
  return !config.type || config.type === 'stdio' || config.type === 'sdk'
}

export function getServerCacheKey(
  name: string,
  serverRef: ScopedMcpServerConfig,
): string {
  return `${name}-${jsonStringify(serverRef)}`
}

export function clearMcpLifecycleCaches(
  name: string,
  serverRef: ScopedMcpServerConfig,
  caches: McpLifecycleCaches,
): void {
  const key = getServerCacheKey(name, serverRef)
  caches.connectionCache.delete(key)
  caches.toolsCache.delete(name)
  caches.resourcesCache.delete(name)
  caches.commandsCache.delete(name)
  caches.skillsCache?.delete(name)
}

export function areMcpConfigsEqual(
  a: ScopedMcpServerConfig,
  b: ScopedMcpServerConfig,
): boolean {
  if (a.type !== b.type) {
    return false
  }

  const { scope: _scopeA, ...configA } = a
  const { scope: _scopeB, ...configB } = b
  return jsonStringify(configA) === jsonStringify(configB)
}

export function partitionMcpConfigEntries(
  entries: McpConfigEntry[],
  isDisabled: (name: string) => boolean,
): {
  activeEntries: McpConfigEntry[]
  disabledEntries: McpConfigEntry[]
} {
  const activeEntries: McpConfigEntry[] = []
  const disabledEntries: McpConfigEntry[] = []

  for (const entry of entries) {
    if (isDisabled(entry[0])) {
      disabledEntries.push(entry)
    } else {
      activeEntries.push(entry)
    }
  }

  return { activeEntries, disabledEntries }
}

export function describeMcpServerPlan(entries: McpConfigEntry[]): {
  localServers: McpConfigEntry[]
  remoteServers: McpConfigEntry[]
  serverStats: McpServerStats
} {
  const totalServers = entries.length
  const stdioCount = count(entries, ([_, c]) => c.type === 'stdio')
  const sseCount = count(entries, ([_, c]) => c.type === 'sse')
  const httpCount = count(entries, ([_, c]) => c.type === 'http')
  const sseIdeCount = count(entries, ([_, c]) => c.type === 'sse-ide')
  const wsIdeCount = count(entries, ([_, c]) => c.type === 'ws-ide')

  return {
    localServers: entries.filter(([_, config]) => isLocalMcpServer(config)),
    remoteServers: entries.filter(([_, config]) => !isLocalMcpServer(config)),
    serverStats: {
      totalServers,
      stdioCount,
      sseCount,
      httpCount,
      sseIdeCount,
      wsIdeCount,
    },
  }
}
