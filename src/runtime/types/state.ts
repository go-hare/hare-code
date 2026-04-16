import type { TaskState } from './tasks.js'

export type RuntimeLifecycleState =
  | 'created'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'errored'

export type CoordinatorModeState = {
  enabled: boolean
  workerToolNames?: string[]
  coordinatorToolNames?: string[]
  metadata?: Record<string, unknown>
}

export type RuntimeState = {
  lifecycle: RuntimeLifecycleState
  conversationId?: string
  activeTurnId?: string
  activeRunId?: string
  activeTaskId?: string
  pendingToolRunId?: string
  coordinator: CoordinatorModeState
  tasks: TaskState[]
  metadata?: Record<string, unknown>
}
