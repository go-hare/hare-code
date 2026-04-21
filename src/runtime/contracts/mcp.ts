export type RuntimeMcpTransport =
  | 'stdio'
  | 'sse'
  | 'sse-ide'
  | 'http'
  | 'ws'
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

export interface RuntimeMcpRegistry {
  listServers(): readonly RuntimeMcpServerRef[]
  listResources(serverName?: string): readonly RuntimeMcpResourceRef[]
  listToolBindings(): readonly RuntimeMcpToolBinding[]
}

export interface RuntimeMcpSessionBinding {
  attach(serverName: string): Promise<void>
  detach(serverName: string): Promise<void>
}
