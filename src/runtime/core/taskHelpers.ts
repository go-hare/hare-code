import type { RuntimeEvent, TaskState } from '../types/index.js'

const TERMINAL_TASK_STATUSES = new Set(['completed', 'failed', 'killed', 'cancelled'])

export function cloneRuntimeTask(task: TaskState): TaskState {
  return {
    ...task,
    progress: task.progress ? { ...task.progress } : undefined,
    metadata: { ...(task.metadata || {}) },
  }
}

export function isVisibleRuntimeTask(
  task: TaskState,
  includeCompleted: boolean,
): boolean {
  if (includeCompleted) {
    return true
  }
  return !TERMINAL_TASK_STATUSES.has(task.status)
}

export function buildTaskTransitionEvent(
  previous: TaskState,
  nextTask: TaskState,
): RuntimeEvent {
  switch (nextTask.status) {
    case 'running':
      return {
        type: 'task_resumed',
        taskId: nextTask.taskId,
        conversationId: nextTask.conversationId,
        turnId: nextTask.turnId,
        reason: `Transitioned from ${previous.status}`,
      }
    case 'paused':
      return {
        type: 'task_paused',
        taskId: nextTask.taskId,
        conversationId: nextTask.conversationId,
        turnId: nextTask.turnId,
        reason: `Transitioned from ${previous.status}`,
      }
    case 'completed':
      return {
        type: 'task_completed',
        taskId: nextTask.taskId,
        conversationId: nextTask.conversationId,
        turnId: nextTask.turnId,
        resultSummary: nextTask.resultSummary,
      }
    case 'failed':
    case 'killed':
    case 'cancelled':
      return {
        type: 'task_failed',
        taskId: nextTask.taskId,
        conversationId: nextTask.conversationId,
        turnId: nextTask.turnId,
        error: nextTask.error || `Task ${nextTask.status}`,
      }
    default:
      return {
        type: 'task_progress',
        taskId: nextTask.taskId,
        conversationId: nextTask.conversationId,
        turnId: nextTask.turnId,
        progressText: `Task status: ${nextTask.status}`,
      }
  }
}
