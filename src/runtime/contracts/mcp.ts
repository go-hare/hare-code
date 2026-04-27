export type RuntimeMcpTransport =
  | 'stdio'
  | 'sse'
  | 'sse-ide'
  | 'http'
  | 'ws'
  | 'ws-ide'
  | 'sdk'
  | 'claudeai-proxy'
  | 'unknown'

export type RuntimeMcpConnectionState =
  | 'pending'
  | 'connected'
  | 'needs-auth'
  | 'failed'
  | 'disabled'

export interface RuntimeMcpServerRef {
  name: string
  transport: RuntimeMcpTransport
  state: RuntimeMcpConnectionState
  scope?: string
  capabilities?: Record<string, unknown>
  error?: string
}

export interface RuntimeMcpResourceRef {
  server: string
  uri: string
  name?: string
  mimeType?: string
}

export interface RuntimeMcpToolBinding {
  server: string
  serverToolName: string
  runtimeToolName: string
}

export type RuntimeMcpConnectRequest = {
  serverName: string
  metadata?: Record<string, unknown>
}

export type RuntimeMcpAuthAction = 'authenticate' | 'clear'

export type RuntimeMcpAuthRequest = {
  serverName: string
  action?: RuntimeMcpAuthAction
  callbackUrl?: string
  metadata?: Record<string, unknown>
}

export type RuntimeMcpSetEnabledRequest = {
  serverName: string
  enabled: boolean
  metadata?: Record<string, unknown>
}

export type RuntimeMcpLifecycleResult = {
  serverName: string
  state: RuntimeMcpConnectionState
  server?: RuntimeMcpServerRef
  snapshot?: Partial<RuntimeMcpRegistrySnapshot>
  authorizationUrl?: string
  message?: string
  metadata?: Record<string, unknown>
}

export interface RuntimeMcpRegistrySnapshot {
  servers: readonly RuntimeMcpServerRef[]
  resources: readonly RuntimeMcpResourceRef[]
  toolBindings: readonly RuntimeMcpToolBinding[]
}

export interface RuntimeMcpRegistry {
  listServers(): readonly RuntimeMcpServerRef[]
  listResources(serverName?: string): readonly RuntimeMcpResourceRef[]
  listToolBindings(): readonly RuntimeMcpToolBinding[]
}

export interface RuntimeMcpSessionBinding {
  attach(serverName: string): Promise<void>
  detach(serverName: string): Promise<void>
}
