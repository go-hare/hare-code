import type {
  RuntimePermissionDecision,
  RuntimePermissionRequest,
} from './permissions.js'

export type RuntimeHostKind =
  | 'cli'
  | 'terminal'
  | 'headless'
  | 'bridge'
  | 'daemon'
  | 'server'
  | 'test'

export type RuntimeHostCapability =
  | 'interactive'
  | 'command-parsing'
  | 'render-output'
  | 'notifications'
  | 'remote-control'
  | 'background-workers'

export type RuntimeHostEvent =
  | {
      type: 'session'
      phase: 'created' | 'restored' | 'ended'
      sessionId: string
    }
  | {
      type: 'status'
      status:
        | 'idle'
        | 'running'
        | 'waiting'
        | 'completed'
        | 'failed'
        | 'cancelled'
    }
  | {
      type: 'message'
      role: 'system' | 'user' | 'assistant'
      messageId?: string
    }
  | {
      type: 'tool'
      toolName: string
      phase: 'queued' | 'started' | 'completed' | 'failed'
    }
  | {
      type: 'command'
      commandName: string
      phase: 'queued' | 'started' | 'completed' | 'failed'
    }
  | {
      type: 'mcp'
      serverName: string
      phase: 'connecting' | 'connected' | 'failed' | 'disconnected'
    }

export type RuntimeHostAction =
  | { type: 'notify'; message: string }
  | { type: 'copy-to-clipboard'; text: string }
  | { type: 'open-url'; url: string }
  | { type: 'set-permission-mode'; mode: string }
  | { type: 'refresh-tools' }
  | { type: 'focus-session'; sessionId: string }

export interface RuntimeHostContext {
  kind: RuntimeHostKind
  name: string
  cwd: string
  projectRoot: string
  capabilities: readonly RuntimeHostCapability[]
  sessionSource?: string
}

export interface RuntimeHostEventSink {
  emit(event: RuntimeHostEvent): void
  requestPermission?(
    request: RuntimePermissionRequest,
  ): Promise<RuntimePermissionDecision>
  dispatch?(action: RuntimeHostAction): Promise<void> | void
}

export interface RuntimeHostBridge {
  readonly context: RuntimeHostContext
  readonly events: RuntimeHostEventSink
}
