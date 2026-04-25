/**
 * In-Process Teammate Helpers
 *
 * Helper functions for in-process teammate integration.
 * Provides utilities to:
 * - Find task ID by agent name
 * - Handle plan approval responses
 * - Update awaitingPlanApproval state
 * - Detect permission-related messages
 */

import type { Tools } from '../Tool.js'
import type { AppState } from '../state/AppState.js'
import {
  createActivityDescriptionResolver,
  createProgressTracker,
  getProgressUpdate,
  type AgentProgress,
  updateProgressFromMessage,
} from '../tasks/LocalAgentTask/LocalAgentTask.js'
import {
  TEAMMATE_MESSAGES_UI_CAP,
  getTeammateExecutionBackend,
  type InProcessTeammateTaskState,
  isInProcessTeammateTask,
} from '../tasks/InProcessTeammateTask/types.js'
import type { Message } from '../types/message.js'
import { asAgentId } from '../types/ids.js'
import { getAllBaseTools } from '../tools.js'
import { getAgentTranscript } from './sessionStorage.js'
import { updateTaskState } from './task/framework.js'
import {
  isPermissionResponse,
  isSandboxPermissionResponse,
  type PlanApprovalResponseMessage,
} from './teammateMailbox.js'

type SetAppState = (updater: (prev: AppState) => AppState) => void

/**
 * Find the task ID for an in-process teammate by agent name.
 *
 * @param agentName - The agent name (e.g., "researcher")
 * @param appState - Current AppState
 * @returns Task ID if found, undefined otherwise
 */
export function findInProcessTeammateTaskId(
  agentName: string,
  appState: AppState,
): string | undefined {
  for (const task of Object.values(appState.tasks)) {
    if (
      isInProcessTeammateTask(task) &&
      task.identity.agentName === agentName
    ) {
      return task.id
    }
  }
  return undefined
}

/**
 * Set awaitingPlanApproval state for an in-process teammate.
 *
 * @param taskId - Task ID of the in-process teammate
 * @param setAppState - AppState setter
 * @param awaiting - Whether teammate is awaiting plan approval
 */
export function setAwaitingPlanApproval(
  taskId: string,
  setAppState: SetAppState,
  awaiting: boolean,
): void {
  updateTaskState<InProcessTeammateTaskState>(taskId, setAppState, task => ({
    ...task,
    awaitingPlanApproval: awaiting,
  }))
}

/**
 * Handle plan approval response for an in-process teammate.
 * Called by the message callback when a plan_approval_response arrives.
 *
 * This resets awaitingPlanApproval to false. The permissionMode from the
 * response is handled separately by the agent loop (Task #11).
 *
 * @param taskId - Task ID of the in-process teammate
 * @param _response - The plan approval response message (for future use)
 * @param setAppState - AppState setter
 */
export function handlePlanApprovalResponse(
  taskId: string,
  _response: PlanApprovalResponseMessage,
  setAppState: SetAppState,
): void {
  setAwaitingPlanApproval(taskId, setAppState, false)
}

function hasRecordedProgress(progress: AgentProgress): boolean {
  return (
    progress.toolUseCount > 0 ||
    progress.tokenCount > 0 ||
    progress.lastActivity !== undefined ||
    (progress.recentActivities?.length ?? 0) > 0 ||
    !!progress.summary
  )
}

function mergeRecentMessages(
  transcriptMessages: readonly Message[],
  currentMessages: readonly Message[] | undefined,
): Message[] {
  if (currentMessages === undefined || currentMessages.length === 0) {
    return transcriptMessages.slice(-TEAMMATE_MESSAGES_UI_CAP)
  }

  const merged = [...transcriptMessages]
  const knownUuids = new Set(transcriptMessages.map(message => message.uuid))

  for (const message of currentMessages) {
    if (!knownUuids.has(message.uuid)) {
      merged.push(message)
    }
  }

  return merged.slice(-TEAMMATE_MESSAGES_UI_CAP)
}

export function deriveTeammateProgress(
  messages: readonly Message[],
  tools: Tools = getAllBaseTools(),
): AgentProgress | undefined {
  const tracker = createProgressTracker()
  const resolveActivityDescription = createActivityDescriptionResolver(tools)

  for (const message of messages) {
    updateProgressFromMessage(
      tracker,
      message,
      resolveActivityDescription,
      tools,
    )
  }

  const progress = getProgressUpdate(tracker)
  return hasRecordedProgress(progress) ? progress : undefined
}

export function applyOutOfProcessTeammateIdleSnapshot(
  taskId: string,
  transcriptMessages: readonly Message[] | undefined,
  setAppState: SetAppState,
  tools: Tools = getAllBaseTools(),
): void {
  const progress =
    transcriptMessages !== undefined
      ? deriveTeammateProgress(transcriptMessages, tools)
      : undefined

  updateTaskState<InProcessTeammateTaskState>(taskId, setAppState, task => {
    if (
      task.status !== 'running' ||
      getTeammateExecutionBackend(task) === 'in-process'
    ) {
      return task
    }

    return {
      ...task,
      isIdle: true,
      progress: progress ?? task.progress,
      messages:
        transcriptMessages !== undefined
          ? mergeRecentMessages(transcriptMessages, task.messages)
          : task.messages,
      lastReportedToolCount: progress?.toolUseCount ?? task.lastReportedToolCount,
      lastReportedTokenCount: progress?.tokenCount ?? task.lastReportedTokenCount,
    }
  })
}

export async function syncOutOfProcessTeammateIdleState(
  agentName: string,
  appState: AppState,
  setAppState: SetAppState,
): Promise<void> {
  const taskId = findInProcessTeammateTaskId(agentName, appState)
  if (!taskId) {
    return
  }

  const task = appState.tasks[taskId]
  if (
    !isInProcessTeammateTask(task) ||
    getTeammateExecutionBackend(task) === 'in-process'
  ) {
    return
  }

  const transcript = await getAgentTranscript(asAgentId(task.identity.agentId))
  applyOutOfProcessTeammateIdleSnapshot(
    taskId,
    transcript?.messages,
    setAppState,
  )
}

// ============ Permission Delegation Helpers ============

/**
 * Check if a message is a permission-related response.
 * Used by in-process teammate message handlers to detect and process
 * permission responses from the team leader.
 *
 * Handles both tool permissions and sandbox (network host) permissions.
 *
 * @param messageText - The raw message text to check
 * @returns true if the message is a permission response
 */
export function isPermissionRelatedResponse(messageText: string): boolean {
  return (
    !!isPermissionResponse(messageText) ||
    !!isSandboxPermissionResponse(messageText)
  )
}
