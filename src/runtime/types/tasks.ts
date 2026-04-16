export type TaskStatus =
  | 'queued'
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'killed'
  | 'cancelled'

export type TaskPriority = 'low' | 'normal' | 'high'

export type TaskOwnerKind =
  | 'foreground'
  | 'background'
  | 'worker'
  | 'coordinator'
  | 'remote'
  | 'system'

export type TaskProgress = {
  summary?: string
  percent?: number
  toolUseCount?: number
  tokenCount?: number
  lastActivity?: string
  metadata?: Record<string, unknown>
}

export type TaskState = {
  taskId: string
  type: string
  title: string
  description?: string
  status: TaskStatus
  priority?: TaskPriority
  ownerKind?: TaskOwnerKind
  conversationId?: string
  turnId?: string
  createdAt?: number
  updatedAt?: number
  startedAt?: number
  completedAt?: number
  progress?: TaskProgress
  resultSummary?: string
  error?: string
  metadata?: Record<string, unknown>
}

export type TaskAction =
  | 'pause'
  | 'resume'
  | 'stop'
  | 'retry'
  | 'promote'
  | 'demote'

export type TaskControlResult = {
  accepted: boolean
  taskId: string
  action: TaskAction
  message?: string
  metadata?: Record<string, unknown>
}
