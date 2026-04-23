import { feature } from 'bun:bundle'
import { randomUUID } from 'crypto'
import { dirname } from 'path'
import { EMPTY_USAGE } from '@ant/model-provider'
import type { AppState } from 'src/state/AppStateStore.js'
import { externalMetadataToAppState } from 'src/state/onChangeAppState.js'
import type { RewindFilesResult } from 'src/entrypoints/agentSdkTypes.js'
import type { SessionExternalMetadata } from 'src/utils/sessionState.js'
import type { Message, NormalizedUserMessage } from 'src/types/message.js'
import { logEvent } from 'src/services/analytics/index.js'
import { isPolicyAllowed } from 'src/services/policyLimits/index.js'
import {
  loadConversationForResume,
  type TurnInterruptionState,
} from 'src/utils/conversationRecovery.js'
import { getCwd } from 'src/utils/cwd.js'
import { logError } from 'src/utils/log.js'
import {
  hydrateRemoteSession,
  hydrateFromCCRv2InternalEvents,
  resetSessionFilePointer,
  resetSessionMetadataForResume,
  restoreSessionMetadata,
  saveMode,
} from 'src/utils/sessionStorage.js'
import { restoreSessionStateFromLog } from 'src/utils/sessionRestore.js'
import { parseSessionIdentifier } from 'src/utils/sessionUrl.js'
import { processSessionStartHooks } from 'src/utils/sessionStart.js'
import { gracefulShutdownSync } from 'src/utils/gracefulShutdown.js'
import {
  fileHistoryRewind,
  fileHistoryCanRestore,
  fileHistoryEnabled,
  fileHistoryGetDiffStats,
} from 'src/utils/fileHistory.js'
import { errorMessage } from '../../../../utils/errors.js'
import { isEnvTruthy } from '../../../../utils/envUtils.js'
import { jsonStringify } from '../../../../utils/slowOperations.js'
import { asSessionId } from 'src/types/ids.js'
import type { UUID } from 'crypto'
import type { RuntimeBootstrapStateProvider } from '../../../core/state/providers.js'

/* eslint-disable @typescript-eslint/no-require-imports */
const coordinatorModeModule = feature('COORDINATOR_MODE')
  ? (require('../../../../coordinator/coordinatorMode.js') as typeof import('../../../../coordinator/coordinatorMode.js'))
  : null
/* eslint-enable @typescript-eslint/no-require-imports */

export function removeInterruptedMessage(
  messages: Message[],
  interruptedUserMessage: NormalizedUserMessage,
): void {
  const idx = messages.findIndex(m => m.uuid === interruptedUserMessage.uuid)
  if (idx !== -1) {
    messages.splice(idx, 2)
  }
}

export type LoadInitialMessagesResult = {
  messages: Message[]
  turnInterruptionState?: TurnInterruptionState
  agentSetting?: string
}

export function emitLoadError(
  bootstrapStateProvider: RuntimeBootstrapStateProvider,
  message: string,
  outputFormat: string | undefined,
): void {
  if (outputFormat === 'stream-json') {
    const errorResult = {
      type: 'result',
      subtype: 'error_during_execution',
      duration_ms: 0,
      duration_api_ms: 0,
      is_error: true,
      num_turns: 0,
      stop_reason: null,
      session_id: bootstrapStateProvider.getSessionIdentity().sessionId,
      total_cost_usd: 0,
      usage: EMPTY_USAGE,
      modelUsage: {},
      permission_denials: [],
      uuid: randomUUID(),
      errors: [message],
    }
    process.stdout.write(jsonStringify(errorResult) + '\n')
  } else {
    process.stderr.write(message + '\n')
  }
}

export async function handleRewindFiles(
  userMessageId: UUID,
  appState: AppState,
  setAppState: (updater: (prev: AppState) => AppState) => void,
  dryRun: boolean,
): Promise<RewindFilesResult> {
  if (!fileHistoryEnabled()) {
    return {
      canRewind: false,
      error: 'File rewinding is not enabled.',
      filesChanged: [],
    }
  }
  if (!fileHistoryCanRestore(appState.fileHistory, userMessageId)) {
    return {
      canRewind: false,
      error: 'No file checkpoint found for this message.',
      filesChanged: [],
    }
  }

  if (dryRun) {
    const diffStats = await fileHistoryGetDiffStats(
      appState.fileHistory,
      userMessageId,
    )
    return {
      canRewind: true,
      filesChanged: diffStats?.filesChanged ?? [],
      insertions: diffStats?.insertions,
      deletions: diffStats?.deletions,
    }
  }

  try {
    await fileHistoryRewind(
      updater =>
        setAppState(prev => ({
          ...prev,
          fileHistory: updater(prev.fileHistory),
        })),
      userMessageId,
    )
  } catch (error) {
    return {
      canRewind: false,
      error: `Failed to rewind: ${errorMessage(error)}`,
      filesChanged: [],
    }
  }

  return { canRewind: true, filesChanged: [] }
}

export async function loadInitialMessages(
  bootstrapStateProvider: RuntimeBootstrapStateProvider,
  setAppState: (f: (prev: AppState) => AppState) => void,
  options: {
    continue: boolean | undefined
    teleport: string | true | null | undefined
    resume: string | boolean | undefined
    resumeSessionAt: string | undefined
    forkSession: boolean | undefined
    outputFormat: string | undefined
    sessionStartHooksPromise?: ReturnType<typeof processSessionStartHooks>
    restoredWorkerState: Promise<SessionExternalMetadata | null>
  },
  emitLoadError: (message: string, outputFormat: string | undefined) => void,
): Promise<LoadInitialMessagesResult> {
  const persistSession = !bootstrapStateProvider.isSessionPersistenceDisabled()
  if (options.continue) {
    try {
      logEvent('tengu_continue_print', {})

      const result = await loadConversationForResume(undefined, undefined)
      if (result) {
        if (feature('COORDINATOR_MODE') && coordinatorModeModule) {
          const warning = coordinatorModeModule.matchSessionMode(result.mode)
          if (warning) {
            process.stderr.write(warning + '\n')
            const {
              getAgentDefinitionsWithOverrides,
              getActiveAgentsFromList,
            } =
              require('@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js') as typeof import('@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js')
            getAgentDefinitionsWithOverrides.cache.clear?.()
            const freshAgentDefs = await getAgentDefinitionsWithOverrides(
              getCwd(),
            )

            setAppState(prev => ({
              ...prev,
              agentDefinitions: {
                ...freshAgentDefs,
                allAgents: freshAgentDefs.allAgents,
                activeAgents: getActiveAgentsFromList(freshAgentDefs.allAgents),
              },
            }))
          }
        }

        if (!options.forkSession && result.sessionId) {
          bootstrapStateProvider.switchSession(
            asSessionId(result.sessionId),
            result.fullPath ? dirname(result.fullPath) : null,
          )
          if (persistSession) {
            await resetSessionFilePointer()
          }
        }
        restoreSessionStateFromLog(result, setAppState)
        resetSessionMetadataForResume()
        restoreSessionMetadata(
          options.forkSession
            ? { ...result, worktreeSession: undefined }
            : result,
        )

        if (feature('COORDINATOR_MODE') && coordinatorModeModule) {
          saveMode(
            coordinatorModeModule.isCoordinatorMode()
              ? 'coordinator'
              : 'normal',
          )
        }

        return {
          messages: result.messages,
          turnInterruptionState: result.turnInterruptionState,
          agentSetting: result.agentSetting,
        }
      }
    } catch (error) {
      logError(error)
      gracefulShutdownSync(1)
      return { messages: [] }
    }
  }

  if (options.teleport) {
    try {
      if (!isPolicyAllowed('allow_remote_sessions')) {
        throw new Error(
          "Remote sessions are disabled by your organization's policy.",
        )
      }

      logEvent('tengu_teleport_print', {})

      if (typeof options.teleport !== 'string') {
        throw new Error('No session ID provided for teleport')
      }

      const {
        checkOutTeleportedSessionBranch,
        processMessagesForTeleportResume,
        teleportResumeCodeSession,
        validateGitState,
      } = await import('src/utils/teleport.js')
      await validateGitState()
      const teleportResult = await teleportResumeCodeSession(options.teleport)
      const { branchError } = await checkOutTeleportedSessionBranch(
        teleportResult.branch,
      )
      return {
        messages: processMessagesForTeleportResume(
          teleportResult.log,
          branchError,
        ),
      }
    } catch (error) {
      logError(error)
      gracefulShutdownSync(1)
      return { messages: [] }
    }
  }

  if (options.resume) {
    try {
      logEvent('tengu_resume_print', {})

      const parsedSessionId = parseSessionIdentifier(
        typeof options.resume === 'string' ? options.resume : '',
      )
      if (!parsedSessionId) {
        let errorMessage =
          'Error: --resume requires a valid session ID when used with --print. Usage: claude -p --resume <session-id>'
        if (typeof options.resume === 'string') {
          errorMessage += `. Session IDs must be in UUID format (e.g., 550e8400-e29b-41d4-a716-446655440000). Provided value "${options.resume}" is not a valid UUID`
        }
        emitLoadError(errorMessage, options.outputFormat)
        gracefulShutdownSync(1)
        return { messages: [] }
      }

      if (isEnvTruthy(process.env.CLAUDE_CODE_USE_CCR_V2)) {
        const sessionId = parsedSessionId.sessionId as UUID
        const [, metadata] = await Promise.all([
          hydrateFromCCRv2InternalEvents(sessionId),
          options.restoredWorkerState,
        ])
        if (metadata) {
          setAppState(externalMetadataToAppState(metadata))
          if (typeof metadata.model === 'string') {
            bootstrapStateProvider.patchPromptState({
              mainLoopModelOverride: metadata.model,
            })
          }
        }
      } else if (
        parsedSessionId.isUrl &&
        parsedSessionId.ingressUrl &&
        isEnvTruthy(process.env.ENABLE_SESSION_PERSISTENCE)
      ) {
        const sessionId = parsedSessionId.sessionId as UUID
        await hydrateRemoteSession(
          sessionId,
          parsedSessionId.ingressUrl,
        )
      }

      const result = await loadConversationForResume(
        parsedSessionId.sessionId,
        parsedSessionId.jsonlFile || undefined,
      )

      if (!result || result.messages.length === 0) {
        if (
          parsedSessionId.isUrl ||
          isEnvTruthy(process.env.CLAUDE_CODE_USE_CCR_V2)
        ) {
          return {
            messages: await (options.sessionStartHooksPromise ??
              processSessionStartHooks('startup')),
          }
        } else {
          emitLoadError(
            `No conversation found with session ID: ${parsedSessionId.sessionId}`,
            options.outputFormat,
          )
          gracefulShutdownSync(1)
          return { messages: [] }
        }
      }

      if (options.resumeSessionAt) {
        const index = result.messages.findIndex(
          m => m.uuid === options.resumeSessionAt,
        )
        if (index < 0) {
          emitLoadError(
            `No message found with message.uuid of: ${options.resumeSessionAt}`,
            options.outputFormat,
          )
          gracefulShutdownSync(1)
          return { messages: [] }
        }

        result.messages = index >= 0 ? result.messages.slice(0, index + 1) : []
      }

      if (feature('COORDINATOR_MODE') && coordinatorModeModule) {
        const warning = coordinatorModeModule.matchSessionMode(result.mode)
        if (warning) {
          process.stderr.write(warning + '\n')
          const { getAgentDefinitionsWithOverrides, getActiveAgentsFromList } =
            require('@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js') as typeof import('@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js')
          getAgentDefinitionsWithOverrides.cache.clear?.()
          const freshAgentDefs = await getAgentDefinitionsWithOverrides(
            getCwd(),
          )

          setAppState(prev => ({
            ...prev,
            agentDefinitions: {
              ...freshAgentDefs,
              allAgents: freshAgentDefs.allAgents,
              activeAgents: getActiveAgentsFromList(freshAgentDefs.allAgents),
            },
          }))
        }
      }

      if (!options.forkSession && result.sessionId) {
        bootstrapStateProvider.switchSession(
          asSessionId(result.sessionId),
          result.fullPath ? dirname(result.fullPath) : null,
        )
        if (persistSession) {
          await resetSessionFilePointer()
        }
      }
      restoreSessionStateFromLog(result, setAppState)
      resetSessionMetadataForResume()
      restoreSessionMetadata(
        options.forkSession
          ? { ...result, worktreeSession: undefined }
          : result,
      )

      if (feature('COORDINATOR_MODE') && coordinatorModeModule) {
        saveMode(
          coordinatorModeModule.isCoordinatorMode() ? 'coordinator' : 'normal',
        )
      }

      return {
        messages: result.messages,
        turnInterruptionState: result.turnInterruptionState,
        agentSetting: result.agentSetting,
      }
    } catch (error) {
      logError(error)
      const errorText =
        error instanceof Error
          ? `Failed to resume session: ${error.message}`
          : 'Failed to resume session with --print mode'
      emitLoadError(errorText, options.outputFormat)
      gracefulShutdownSync(1)
      return { messages: [] }
    }
  }

  return {
    messages: await (options.sessionStartHooksPromise ??
      processSessionStartHooks('startup')),
  }
}
