export type RuntimePermissionMode = string

export type RuntimePermissionKind =
  | 'tool'
  | 'command'
  | 'filesystem'
  | 'network'
  | 'mcp'
  | 'session'
  | 'host'
  | 'other'

export type RuntimePermissionSource =
  | 'user'
  | 'runtime'
  | 'host'
  | 'policy'
  | 'bridge'
  | 'daemon'
  | 'channel'
  | 'automation'

export type RuntimePermissionRequest = {
  id: string
  kind: RuntimePermissionKind
  source: RuntimePermissionSource
  target: string
  input?: unknown
  metadata?: Record<string, unknown>
}

export type RuntimePermissionDecision = {
  behavior: 'allow' | 'deny' | 'ask'
  reason?: string
  updatedInput?: unknown
  mode?: RuntimePermissionMode
}

export interface RuntimePermissionEvaluator {
  getMode(): RuntimePermissionMode
  evaluate(
    request: RuntimePermissionRequest,
  ): Promise<RuntimePermissionDecision>
}
