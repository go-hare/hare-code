import type { TaskState as LegacyTaskState } from '../../tasks/types.js'
import type { TaskState } from '../../runtime/types/index.js'

function inferOwnerKind(task: LegacyTaskState): TaskState['ownerKind'] {
  switch (task.type) {
    case 'remote_agent':
    case 'in_process_teammate':
      return 'worker'
    case 'dream':
      return 'system'
    default:
      if ('isBackgrounded' in task) {
        return task.isBackgrounded ? 'background' : 'foreground'
      }
      return 'background'
  }
}

function inferTitle(task: LegacyTaskState): string {
  if ('title' in task && typeof task.title === 'string' && task.title.length > 0) {
    return task.title
  }
  if ('prompt' in task && typeof task.prompt === 'string' && task.prompt.length > 0) {
    return task.prompt.slice(0, 80)
  }
  return task.description.slice(0, 80) || task.id
}

function inferProgress(task: LegacyTaskState): TaskState['progress'] {
  if (!('progress' in task) || !task.progress || typeof task.progress !== 'object') {
    return undefined
  }

  return {
    summary:
      'summary' in task.progress && typeof task.progress.summary === 'string'
        ? task.progress.summary
        : undefined,
    toolUseCount:
      'toolUseCount' in task.progress &&
      typeof task.progress.toolUseCount === 'number'
        ? task.progress.toolUseCount
        : undefined,
    tokenCount:
      'tokenCount' in task.progress && typeof task.progress.tokenCount === 'number'
        ? task.progress.tokenCount
        : undefined,
    metadata: {},
  }
}

export function mapLegacyTaskToRuntimeTask(task: LegacyTaskState): TaskState {
  return {
    taskId: task.id,
    type: task.type,
    title: inferTitle(task),
    description: task.description,
    status: task.status,
    ownerKind: inferOwnerKind(task),
    createdAt: task.startTime,
    updatedAt: task.endTime || Date.now(),
    startedAt: task.startTime,
    completedAt: task.endTime,
    progress: inferProgress(task),
    error: 'error' in task && typeof task.error === 'string' ? task.error : undefined,
    metadata: {
      source: 'legacy_cli_task',
      ...(task.toolUseId ? { toolUseId: task.toolUseId } : {}),
    },
  }
}

export function createRuntimeTaskSignature(task: TaskState): string {
  return JSON.stringify({
    status: task.status,
    title: task.title,
    description: task.description,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt,
    error: task.error,
    progress: task.progress,
  })
}
