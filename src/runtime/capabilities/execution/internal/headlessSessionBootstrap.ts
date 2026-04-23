import { dirname } from 'path'
import { externalMetadataToAppState } from 'src/state/onChangeAppState.js'
import type { AppState } from 'src/state/AppStateStore.js'
import type { SessionExternalMetadata } from 'src/utils/sessionState.js'
import { restoreSessionStateFromLog } from 'src/utils/sessionRestore.js'
import { asSessionId } from 'src/types/ids.js'
import {
  resetSessionFilePointer,
  resetSessionMetadataForResume,
  restoreSessionMetadata,
} from 'src/utils/sessionStorage.js'
import type { RuntimeBootstrapStateProvider } from '../../../core/state/providers.js'

type RestorableSessionMetadata = Parameters<typeof restoreSessionMetadata>[0]

export type HeadlessLoadedConversation = RestorableSessionMetadata & {
  sessionId?: string
  fullPath?: string | null
}

export type HeadlessLoadedConversationResult = Parameters<
  typeof restoreSessionStateFromLog
>[0] &
  HeadlessLoadedConversation

type HeadlessSessionBootstrapDeps = {
  resetSessionFilePointer: () => Promise<void>
  resetSessionMetadataForResume: () => void
  restoreSessionMetadata: (meta: RestorableSessionMetadata) => void
  restoreSessionStateFromLog: typeof restoreSessionStateFromLog
}

export type HeadlessSessionBootstrap = {
  applyExternalMetadata(
    metadata: SessionExternalMetadata | null,
    setAppState: (f: (prev: AppState) => AppState) => void,
  ): void
  applyLoadedConversation(
    conversation: HeadlessLoadedConversationResult,
    setAppState: (f: (prev: AppState) => AppState) => void,
    options: {
      forkSession: boolean | undefined
      persistSession: boolean
    },
  ): Promise<void>
  adoptLoadedConversation(
    conversation: HeadlessLoadedConversation,
    options: {
      forkSession: boolean | undefined
      persistSession: boolean
    },
  ): Promise<void>
}

const defaultDeps: HeadlessSessionBootstrapDeps = {
  resetSessionFilePointer,
  resetSessionMetadataForResume,
  restoreSessionMetadata,
  restoreSessionStateFromLog,
}

export function createHeadlessSessionBootstrap(
  bootstrapStateProvider: RuntimeBootstrapStateProvider,
  deps: HeadlessSessionBootstrapDeps = defaultDeps,
): HeadlessSessionBootstrap {
  const adoptLoadedConversation = async (
    conversation: HeadlessLoadedConversation,
    options: {
      forkSession: boolean | undefined
      persistSession: boolean
    },
  ): Promise<void> => {
    if (!options.forkSession && conversation.sessionId) {
      bootstrapStateProvider.switchSession(
        asSessionId(conversation.sessionId),
        conversation.fullPath ? dirname(conversation.fullPath) : null,
      )
      if (options.persistSession) {
        await deps.resetSessionFilePointer()
      }
    }

    deps.resetSessionMetadataForResume()
    deps.restoreSessionMetadata(
      options.forkSession
        ? { ...conversation, worktreeSession: undefined }
        : conversation,
    )
  }

  return {
    applyExternalMetadata(metadata, setAppState) {
      if (!metadata) {
        return
      }

      setAppState(externalMetadataToAppState(metadata))
      if (typeof metadata.model === 'string') {
        bootstrapStateProvider.patchPromptState({
          mainLoopModelOverride: metadata.model,
        })
      }
    },

    async applyLoadedConversation(conversation, setAppState, options) {
      deps.restoreSessionStateFromLog(conversation, setAppState)
      await adoptLoadedConversation(conversation, options)
    },

    async adoptLoadedConversation(conversation, options) {
      await adoptLoadedConversation(conversation, options)
    },
  }
}
