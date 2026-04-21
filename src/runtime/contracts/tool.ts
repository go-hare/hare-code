export type RuntimeToolSafety = 'read' | 'write' | 'destructive'

export type RuntimeToolSource = 'builtin' | 'mcp' | 'plugin' | 'skill' | 'host'

export interface RuntimeToolDescriptor {
  name: string
  description: string
  source: RuntimeToolSource
  aliases?: readonly string[]
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  safety: RuntimeToolSafety
  isConcurrencySafe?: boolean
  isDeferred?: boolean
  isMcp?: boolean
  isOpenWorld?: boolean
  requiresUserInteraction?: boolean
}

export type RuntimeToolCall = {
  toolName: string
  input: unknown
}

export type RuntimeToolResult = {
  output: unknown
  isError?: boolean
  metadata?: Record<string, unknown>
}

export interface RuntimeToolExecutionContext {
  sessionId: string
  cwd: string
  permissionMode: string
  abortSignal: AbortSignal
}

export interface RuntimeToolCatalog {
  list(): readonly RuntimeToolDescriptor[]
  find(name: string): RuntimeToolDescriptor | undefined
}

export interface RuntimeToolExecutor {
  execute(
    call: RuntimeToolCall,
    context: RuntimeToolExecutionContext,
  ): Promise<RuntimeToolResult>
}
