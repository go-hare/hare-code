import type { TaskState } from '../../runtime/types/index.js'
import type { CliRuntimeHostViewState } from './types.js'

const TERMINAL_RUNTIME_TASK_STATUSES = new Set([
  'completed',
  'failed',
  'killed',
  'cancelled',
])

function isRuntimeTaskPanelTask(task: TaskState): boolean {
  if (TERMINAL_RUNTIME_TASK_STATUSES.has(task.status)) {
    return false
  }

  return task.metadata?.source !== 'legacy_cli_task'
}

export function getCliRuntimeTaskPanelTasks(
  state?: CliRuntimeHostViewState,
): TaskState[] {
  if (!state) {
    return []
  }

  return Object.values(state.tasks)
    .filter(isRuntimeTaskPanelTask)
    .sort((a, b) => {
      if (a.taskId === state.runtime.activeTaskId) return -1
      if (b.taskId === state.runtime.activeTaskId) return 1
      if (a.status === 'running' && b.status !== 'running') return -1
      if (b.status === 'running' && a.status !== 'running') return 1
      return (b.updatedAt || 0) - (a.updatedAt || 0)
    })
}
