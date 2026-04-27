export type RuntimeHookType =
  | 'command'
  | 'prompt'
  | 'agent'
  | 'http'
  | 'callback'
  | 'function'
  | 'unknown'

export type RuntimeHookSource =
  | 'userSettings'
  | 'projectSettings'
  | 'localSettings'
  | 'policySettings'
  | 'pluginHook'
  | 'sessionHook'
  | 'builtinHook'
  | 'unknown'

export interface RuntimeHookDescriptor {
  event: string
  type: RuntimeHookType
  source: RuntimeHookSource
  matcher?: string
  pluginName?: string
  displayName?: string
  timeoutSeconds?: number
  async?: boolean
  once?: boolean
}

export interface RuntimeHookRegistrySnapshot {
  hooks: readonly RuntimeHookDescriptor[]
}

export type RuntimeHookRunRequest = {
  event: string
  input?: unknown
  matcher?: string
  metadata?: Record<string, unknown>
}

export type RuntimeHookRunError = {
  message: string
  hook?: RuntimeHookDescriptor
  code?: string
}

export type RuntimeHookRunResult = {
  event: string
  handled: boolean
  outputs?: readonly unknown[]
  errors?: readonly RuntimeHookRunError[]
  metadata?: Record<string, unknown>
}

export type RuntimeHookRegisterRequest = {
  hook: RuntimeHookDescriptor
  handlerRef?: string
  metadata?: Record<string, unknown>
}

export type RuntimeHookMutationResult = {
  hook: RuntimeHookDescriptor
  registered: boolean
  handlerRef?: string
  metadata?: Record<string, unknown>
}
