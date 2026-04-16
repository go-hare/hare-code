import type { RuntimeEvent, TaskState } from '../../runtime/types/index.js'
import type {
  CliRuntimeHostViewState,
  CliRuntimeNotification,
} from './types.js'

export type TaskEventContext = {
  now: number
  createNotificationId: () => string
}

export function applyTaskEventState(
  state: CliRuntimeHostViewState,
  event: RuntimeEvent,
  context: TaskEventContext,
): {
  state: CliRuntimeHostViewState
  notification: CliRuntimeNotification | null
} {
  const taskId = event.taskId
  if (!taskId) {
    return { state, notification: null }
  }

  const previous =
    state.tasks[taskId] || createTaskFromEvent(event, context.now) || undefined
  if (!previous) {
    return { state, notification: null }
  }

  const nextTask: TaskState = {
    ...previous,
    updatedAt: context.now,
    conversationId: event.conversationId || previous.conversationId,
    turnId: event.turnId || previous.turnId,
    metadata: {
      ...(previous.metadata || {}),
      ...(event.metadata || {}),
    },
  }

  switch (event.type) {
    case 'task_progress':
      nextTask.progress = {
        ...(previous.progress || {}),
        summary: event.progressText || previous.progress?.summary,
        percent: event.percent ?? previous.progress?.percent,
        metadata: {
          ...(previous.progress?.metadata || {}),
          ...(event.payload || {}),
        },
      }
      break
    case 'task_completed':
      nextTask.status = 'completed'
      nextTask.completedAt = context.now
      nextTask.resultSummary = event.resultSummary || previous.resultSummary
      break
    case 'task_failed':
      nextTask.status = 'failed'
      nextTask.completedAt = context.now
      nextTask.error = event.error
      break
    case 'task_paused':
      nextTask.status = 'paused'
      break
    case 'task_resumed':
      nextTask.status = 'running'
      break
    case 'task_started':
      nextTask.status = 'running'
      nextTask.title = event.title
      nextTask.description = event.description || previous.description
      nextTask.startedAt = previous.startedAt || context.now
      break
    default:
      break
  }

  return {
    state: {
      ...state,
      tasks: {
        ...state.tasks,
        [taskId]: nextTask,
      },
    },
    notification: createTaskNotification(
      nextTask,
      event,
      context.createNotificationId,
    ),
  }
}

function createTaskFromEvent(event: RuntimeEvent, now: number): TaskState | null {
  if (event.type !== 'task_started') {
    return null
  }
  return {
    taskId: event.taskId || `task_${now}`,
    type: 'runtime_task',
    title: event.title,
    description: event.description,
    status: 'running',
    conversationId: event.conversationId,
    turnId: event.turnId,
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    metadata: { ...(event.metadata || {}) },
  }
}

function createTaskNotification(
  task: TaskState,
  event: RuntimeEvent,
  createNotificationId: () => string,
): CliRuntimeNotification | null {
  switch (event.type) {
    case 'task_completed':
      return createNotification(
        createNotificationId,
        `${task.title} completed`,
        'info',
        {
          taskId: task.taskId,
          eventType: event.type,
        },
        'medium',
      )
    case 'task_failed':
      return createNotification(
        createNotificationId,
        task.error ? `${task.title} failed: ${task.error}` : `${task.title} failed`,
        'error',
        {
          taskId: task.taskId,
          eventType: event.type,
        },
        'high',
      )
    default:
      return null
  }
}

function createNotification(
  createNotificationId: () => string,
  text: string,
  level: CliRuntimeNotification['level'],
  metadata?: Record<string, unknown>,
  priority?: CliRuntimeNotification['priority'],
): CliRuntimeNotification {
  return {
    key: createNotificationId(),
    text,
    level,
    priority:
      priority ||
      (level === 'error' ? 'high' : level === 'warning' ? 'medium' : 'low'),
    createdAt: Date.now(),
    metadata: { ...(metadata || {}) },
  }
}
