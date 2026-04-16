import type { RuntimeState, TaskState } from '../../runtime/types/index.js'
import type {
  CliRuntimeEventLogEntry,
  CliRuntimeHostViewState,
  CliRuntimeNotification,
} from './types.js'

export function cloneTask(task: TaskState): TaskState {
  return {
    ...task,
    progress: task.progress ? { ...task.progress } : undefined,
    metadata: { ...(task.metadata || {}) },
  }
}

export function toTaskRecord(tasks: TaskState[]): Record<string, TaskState> {
  return tasks.reduce<Record<string, TaskState>>((record, task) => {
    record[task.taskId] = cloneTask(task)
    return record
  }, {})
}

export function cloneCliRuntimeHostState(
  state: CliRuntimeHostViewState,
): CliRuntimeHostViewState {
  return {
    ...state,
    runtime: cloneRuntimeState(state.runtime),
    tasks: toTaskRecord(Object.values(state.tasks)),
    notifications: state.notifications.map(notification =>
      cloneNotification(notification),
    ),
    recentEvents: state.recentEvents.map(entry => cloneEventLogEntry(entry)),
    activeAssistantTextByRunId: { ...state.activeAssistantTextByRunId },
  }
}

export function createCliRuntimeHostState(
  runtime: RuntimeState,
): CliRuntimeHostViewState {
  return {
    runtime: cloneRuntimeState(runtime),
    tasks: toTaskRecord(runtime.tasks),
    notifications: [],
    recentEvents: [],
    activeAssistantTextByRunId: {},
    latestAssistantText: undefined,
    lastError: undefined,
  }
}

export function cloneRuntimeState(runtime: RuntimeState): RuntimeState {
  return {
    ...runtime,
    coordinator: {
      ...runtime.coordinator,
      workerToolNames: [...(runtime.coordinator.workerToolNames || [])],
      coordinatorToolNames: [...(runtime.coordinator.coordinatorToolNames || [])],
      metadata: { ...(runtime.coordinator.metadata || {}) },
    },
    tasks: runtime.tasks.map(task => cloneTask(task)),
    metadata: { ...(runtime.metadata || {}) },
  }
}

function cloneNotification(
  notification: CliRuntimeNotification,
): CliRuntimeNotification {
  return {
    ...notification,
    metadata: { ...(notification.metadata || {}) },
  }
}

function cloneEventLogEntry(
  entry: CliRuntimeEventLogEntry,
): CliRuntimeEventLogEntry {
  return {
    ...entry,
    event: {
      ...entry.event,
      metadata: { ...(entry.event.metadata || {}) },
    },
  }
}
