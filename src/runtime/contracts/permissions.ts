export type RuntimePermissionMode = string

export type KernelPermissionRequestId = string

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

export type KernelPermissionRisk =
  | 'low'
  | 'medium'
  | 'high'
  | 'destructive'

export type KernelPermissionRequest = {
  permissionRequestId: KernelPermissionRequestId
  conversationId: string
  turnId?: string
  toolName: string
  action: string
  argumentsPreview: unknown
  risk: KernelPermissionRisk
  policySnapshot: Record<string, unknown>
  timeoutMs?: number
  metadata?: Record<string, unknown>
}

export type KernelPermissionDecisionValue =
  | 'allow'
  | 'deny'
  | 'allow_once'
  | 'allow_session'
  | 'abort'

export type KernelPermissionDecisionSource =
  | 'host'
  | 'policy'
  | 'timeout'
  | 'runtime'

export type KernelPermissionDecision = {
  permissionRequestId: KernelPermissionRequestId
  decision: KernelPermissionDecisionValue
  decidedBy: KernelPermissionDecisionSource
  reason?: string
  expiresAt?: string
  metadata?: Record<string, unknown>
}
