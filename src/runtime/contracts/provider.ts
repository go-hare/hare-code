export type RuntimeProviderScope =
  | 'anthropic'
  | 'bedrock'
  | 'vertex'
  | 'foundry'
  | 'openai-compatible'
  | 'custom'

export type RuntimeProviderAuthRef =
  | string
  | {
      type: 'env' | 'secret' | 'desktop' | 'keychain'
      id?: string
      name?: string
      service?: string
      account?: string
    }

export type RuntimeProviderHeaderRef =
  | string
  | {
      type: 'env' | 'secret' | 'desktop'
      id?: string
      name?: string
    }

export type RuntimeProviderSelection = {
  providerId: string
  kind?: RuntimeProviderScope
  model?: string
  baseURL?: string
  authRef?: RuntimeProviderAuthRef
  headers?: Readonly<Record<string, string>>
  secretHeadersRef?: RuntimeProviderHeaderRef
  options?: Readonly<Record<string, unknown>>
  metadata?: Readonly<Record<string, unknown>>
}

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
