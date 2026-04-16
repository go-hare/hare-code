import type { CliRuntimeHostViewState } from './types.js'

const TERMINAL_TASK_STATUSES = new Set([
  'completed',
  'failed',
  'killed',
  'cancelled',
])

function getHighlightedTask(
  state: CliRuntimeHostViewState,
){
  const candidates = Object.values(state.tasks)
    .filter(task => !TERMINAL_TASK_STATUSES.has(task.status))
    .sort((a, b) => {
      if (a.taskId === state.runtime.activeTaskId) return -1
      if (b.taskId === state.runtime.activeTaskId) return 1
      if (a.status === 'running' && b.status !== 'running') return -1
      if (b.status === 'running' && a.status !== 'running') return 1
      return (b.updatedAt || 0) - (a.updatedAt || 0)
    })

  return candidates[0]
}

function compactText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 48)
}

export function getCliRuntimeTaskSummary(
  state?: CliRuntimeHostViewState,
): { count: number; label: string; taskId?: string } | undefined {
  if (!state) {
    return undefined
  }

  const activeTasks = Object.values(state.tasks).filter(
    task => !TERMINAL_TASK_STATUSES.has(task.status),
  )

  if (activeTasks.length === 0) {
    return undefined
  }

  const highlightedTask = getHighlightedTask(state)
  const highlightedTaskText =
    highlightedTask?.progress?.summary || highlightedTask?.title || undefined
  return {
    count: activeTasks.length,
    taskId: highlightedTask?.taskId,
    label:
      activeTasks.length === 1
        ? highlightedTaskText || '1 runtime task'
        : `${activeTasks.length} runtime tasks`,
  }
}

export function formatCliRuntimeStatusLine(
  state?: CliRuntimeHostViewState,
): string | undefined {
  if (!state) {
    return undefined
  }

  const taskSummary = getCliRuntimeTaskSummary(state)
  const activeTasks = taskSummary?.count || 0
  const hasActivity =
    activeTasks > 0 ||
    Boolean(state.runtime.activeTurnId) ||
    Boolean(state.lastError) ||
    Boolean(state.latestAssistantText)

  if (!hasActivity && ['created', 'stopped'].includes(state.runtime.lifecycle)) {
    return undefined
  }

  const parts = [`runtime:${state.runtime.lifecycle}`]

  if (activeTasks > 0) {
    parts.push(`tasks:${activeTasks}`)
  }
  if (taskSummary?.label) {
    parts.push(compactText(taskSummary.label))
  }
  if (state.runtime.activeTurnId) {
    parts.push('turn:active')
  }
  if (state.lastError) {
    parts.push('error')
  } else if (state.latestAssistantText) {
    parts.push(compactText(state.latestAssistantText))
  }

  return parts.join(' · ')
}
