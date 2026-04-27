export type KernelRuntimeId = string

export type KernelRuntimeState =
  | 'created'
  | 'starting'
  | 'ready'
  | 'stopping'
  | 'stopped'
  | 'failed'
  | 'disposed'

export type KernelRuntimeHostKind =
  | 'cli'
  | 'desktop'
  | 'daemon'
  | 'remote'
  | 'worker'
  | 'sdk'
  | 'robot'
  | 'test'

export type KernelRuntimeTransportKind =
  | 'in-process'
  | 'stdio'
  | 'ipc'
  | 'websocket'
  | 'http'
  | 'unix-socket'

export type KernelRuntimeTrustLevel =
  | 'first-party'
  | 'workspace'
  | 'local'
  | 'remote'
  | 'untrusted'

export type KernelRuntimeHostIdentity = {
  kind: KernelRuntimeHostKind
  id: string
  transport: KernelRuntimeTransportKind
  trustLevel: KernelRuntimeTrustLevel
  declaredCapabilities: readonly string[]
  metadata?: Record<string, unknown>
}

export type KernelRuntimeScope = {
  runtimeId: KernelRuntimeId
  host: KernelRuntimeHostIdentity
  workspacePath?: string
}

export interface KernelRuntimeLifecycle {
  readonly id: KernelRuntimeId
  readonly state: KernelRuntimeState
  start(): Promise<void>
  dispose(reason?: string): Promise<void>
}
