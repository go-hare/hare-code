import type { RuntimeEvent, RuntimeState, TaskState } from '../../runtime/types/index.js'
import type {
  CliRuntimeEventLogEntry,
  CliRuntimeHostResolvedOptions,
  CliRuntimeHostViewState,
  CliRuntimeNotification,
} from './types.js'
import { applyTaskEventState } from './taskEventState.js'
import {
  cloneRuntimeState,
  cloneTask,
  createCliRuntimeHostState as createCliRuntimeHostStateFromSnapshot,
  toTaskRecord,
} from './stateSnapshot.js'

export type ApplyCliRuntimeEventContext = {
  now: number
  options: CliRuntimeHostResolvedOptions
  createEventId: () => string
  createNotificationId: () => string
}

export function createCliRuntimeHostState(
  runtime: RuntimeState,
): CliRuntimeHostViewState {
  return createCliRuntimeHostStateFromSnapshot(runtime)
}

export function applyCliRuntimeEvent(
  state: CliRuntimeHostViewState,
  event: RuntimeEvent,
  context: ApplyCliRuntimeEventContext,
): CliRuntimeHostViewState {
  const nextState: CliRuntimeHostViewState = {
    ...state,
    recentEvents: appendRecentEvent(
      state.recentEvents,
      event,
      context.now,
      context.createEventId,
      context.options.maxRecentEvents,
    ),
  }

  switch (event.type) {
    case 'runtime_state':
      return applyRuntimeStateEvent(nextState, event.state as RuntimeState)
    case 'assistant_delta':
      return applyAssistantDelta(nextState, event.runId, event.text)
    case 'assistant_done':
      return applyAssistantDone(nextState, event.runId, event.text)
    case 'task_started':
    case 'task_progress':
    case 'task_completed':
    case 'task_failed':
    case 'task_paused':
    case 'task_resumed':
      return applyTaskEvent(nextState, event, context)
    case 'notification':
      return {
        ...nextState,
        notifications: appendNotification(
          nextState.notifications,
          createNotification(
            context.createNotificationId,
            event.message,
            event.level || 'info',
            event.metadata,
          ),
          context.options.maxNotifications,
        ),
      }
    case 'error':
      return {
        ...nextState,
        lastError: event.error,
        notifications: appendNotification(
          nextState.notifications,
          createNotification(
            context.createNotificationId,
            event.error,
            'error',
            event.metadata,
            'high',
          ),
          context.options.maxNotifications,
        ),
      }
    default:
      return nextState
  }
}

function applyRuntimeStateEvent(
  state: CliRuntimeHostViewState,
  runtime: RuntimeState,
): CliRuntimeHostViewState {
  return {
    ...state,
    runtime: cloneRuntimeState(runtime),
    tasks: toTaskRecord(runtime.tasks || []),
  }
}

function applyAssistantDelta(
  state: CliRuntimeHostViewState,
  runId: string | undefined,
  text: string,
): CliRuntimeHostViewState {
  if (!runId) {
    return {
      ...state,
      latestAssistantText: text,
    }
  }

  const current = state.activeAssistantTextByRunId[runId] || ''
  return {
    ...state,
    activeAssistantTextByRunId: {
      ...state.activeAssistantTextByRunId,
      [runId]: `${current}${text}`,
    },
    latestAssistantText: `${current}${text}`,
  }
}

function applyAssistantDone(
  state: CliRuntimeHostViewState,
  runId: string | undefined,
  text: string,
): CliRuntimeHostViewState {
  if (!runId) {
    return {
      ...state,
      latestAssistantText: text,
    }
  }

  const nextBuffers = { ...state.activeAssistantTextByRunId }
  delete nextBuffers[runId]
  return {
    ...state,
    activeAssistantTextByRunId: nextBuffers,
    latestAssistantText: text,
  }
}

function applyTaskEvent(
  state: CliRuntimeHostViewState,
  event: RuntimeEvent,
  context: ApplyCliRuntimeEventContext,
): CliRuntimeHostViewState {
  const { state: nextTaskState, notification } = applyTaskEventState(state, event, {
    now: context.now,
    createNotificationId: context.createNotificationId,
  })
  let nextState = nextTaskState
  if (notification) {
    nextState = {
      ...nextState,
      notifications: appendNotification(
        nextState.notifications,
        notification,
        context.options.maxNotifications,
      ),
    }
  }

  return nextState
}

function appendNotification(
  notifications: CliRuntimeNotification[],
  notification: CliRuntimeNotification,
  maxNotifications: number,
): CliRuntimeNotification[] {
  return [...notifications, notification].slice(-maxNotifications)
}

function appendRecentEvent(
  events: CliRuntimeEventLogEntry[],
  event: RuntimeEvent,
  now: number,
  createEventId: () => string,
  maxRecentEvents: number,
): CliRuntimeEventLogEntry[] {
  return [
    ...events,
    {
      id: createEventId(),
      receivedAt: now,
      event,
    },
  ].slice(-maxRecentEvents)
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
