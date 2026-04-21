export type RuntimeProviderScope =
  | 'anthropic'
  | 'bedrock'
  | 'vertex'
  | 'foundry'
  | 'openai-compatible'
  | 'custom'

export interface RuntimeModelRef {
  id: string
  provider: string
  displayName?: string
}

export type RuntimeProviderRequest = {
  model: string
  messages: readonly unknown[]
  systemPrompt?: string | readonly string[]
  userContext?: Readonly<Record<string, string>>
  systemContext?: Readonly<Record<string, string>>
  maxOutputTokens?: number
  taskBudget?: { total: number }
}

export type RuntimeProviderEvent =
  | { type: 'status'; status: 'started' | 'streaming' | 'completed' | 'failed' }
  | { type: 'chunk'; payload: unknown }
  | { type: 'tool-use'; payload: unknown }
  | { type: 'result'; payload: unknown }

export type RuntimeProviderResponse = {
  model?: string
  requestId?: string
  stopReason?: string | null
  usage?: Record<string, number>
}

export interface RuntimeProviderContext {
  sessionId: string
  cwd: string
  signal: AbortSignal
}

export interface RuntimeProviderAdapter {
  readonly id: string
  readonly scope: RuntimeProviderScope
  listModels?(): readonly RuntimeModelRef[]
  canHandle(model: string): boolean
  execute(
    request: RuntimeProviderRequest,
    context: RuntimeProviderContext,
  ): AsyncIterable<RuntimeProviderEvent>
}

export interface RuntimeProviderRegistry {
  list(): readonly RuntimeProviderAdapter[]
  select(model: string): RuntimeProviderAdapter | undefined
}
