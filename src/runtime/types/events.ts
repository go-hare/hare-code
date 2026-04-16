export type RuntimeEventType =
  | 'assistant_delta'
  | 'assistant_done'
  | 'tool_call'
  | 'tool_progress'
  | 'tool_result'
  | 'pending_tool_call'
  | 'task_started'
  | 'task_progress'
  | 'task_completed'
  | 'task_failed'
  | 'task_paused'
  | 'task_resumed'
  | 'runtime_state'
  | 'notification'
  | 'error'

export type RuntimeEventBase = {
  type: RuntimeEventType
  conversationId?: string
  turnId?: string
  runId?: string
  taskId?: string
  toolUseId?: string
  metadata?: Record<string, unknown>
}

export type AssistantDeltaEvent = RuntimeEventBase & {
  type: 'assistant_delta'
  text: string
}

export type AssistantDoneEvent = RuntimeEventBase & {
  type: 'assistant_done'
  text: string
  stopReason?: string
}

export type ToolCallEvent = RuntimeEventBase & {
  type: 'tool_call'
  toolName: string
  toolInput: Record<string, unknown>
}

export type ToolProgressEvent = RuntimeEventBase & {
  type: 'tool_progress'
  toolName: string
  content: string
}

export type ToolResultEvent = RuntimeEventBase & {
  type: 'tool_result'
  toolName: string
  result: unknown
  isError?: boolean
}

export type PendingToolCallEvent = RuntimeEventBase & {
  type: 'pending_tool_call'
  calls: Array<{
    toolUseId: string
    toolName: string
    toolInput: Record<string, unknown>
  }>
}

export type TaskStartedEvent = RuntimeEventBase & {
  type: 'task_started'
  title: string
  description?: string
}

export type TaskProgressEvent = RuntimeEventBase & {
  type: 'task_progress'
  progressText?: string
  percent?: number
  payload?: Record<string, unknown>
}

export type TaskCompletedEvent = RuntimeEventBase & {
  type: 'task_completed'
  resultSummary?: string
  payload?: Record<string, unknown>
}

export type TaskFailedEvent = RuntimeEventBase & {
  type: 'task_failed'
  error: string
  payload?: Record<string, unknown>
}

export type TaskPausedEvent = RuntimeEventBase & {
  type: 'task_paused'
  reason?: string
}

export type TaskResumedEvent = RuntimeEventBase & {
  type: 'task_resumed'
  reason?: string
}

export type RuntimeStateEvent = RuntimeEventBase & {
  type: 'runtime_state'
  state: Record<string, unknown>
}

export type NotificationEvent = RuntimeEventBase & {
  type: 'notification'
  title?: string
  message: string
  level?: 'info' | 'warning' | 'error'
}

export type RuntimeErrorEvent = RuntimeEventBase & {
  type: 'error'
  error: string
  recoverable?: boolean
}

export type RuntimeEvent =
  | AssistantDeltaEvent
  | AssistantDoneEvent
  | ToolCallEvent
  | ToolProgressEvent
  | ToolResultEvent
  | PendingToolCallEvent
  | TaskStartedEvent
  | TaskProgressEvent
  | TaskCompletedEvent
  | TaskFailedEvent
  | TaskPausedEvent
  | TaskResumedEvent
  | RuntimeStateEvent
  | NotificationEvent
  | RuntimeErrorEvent
