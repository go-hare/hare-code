import { feature } from 'bun:bundle'
import type { AppState } from '../../../state/AppStateStore.js'
import { runReplInitialMessageShell } from '../../replInitialMessageShell.js'

type InitialMessage = NonNullable<AppState['initialMessage']>

export type RunReplInitialMessageControllerOptions = {
  initialMessage: InitialMessage | null
  isLoading: boolean
  initialMessageRef: { current: boolean }
  clearContextForInitialMessage: (
    initialMessage: InitialMessage,
  ) => Promise<void>
  setAppState: (updater: (prev: AppState) => AppState) => void
  createFileHistorySnapshot(messageUuid: InitialMessage['message']['uuid']): void
  awaitPendingHooks(): Promise<void>
  submitInitialPrompt(content: string): void
  createAbortController(): AbortController
  setAbortController(controller: AbortController | null): void
  dispatchInitialMessage(
    message: InitialMessage['message'],
    abortController: AbortController,
  ): void
  scheduleProcessingReset(): void
}

export function runReplInitialMessageController(
  options: RunReplInitialMessageControllerOptions,
): boolean {
  const pending = options.initialMessage
  if (!pending || options.isLoading || options.initialMessageRef.current) {
    return false
  }

  options.initialMessageRef.current = true

  const shouldRestrictAutoPermissions = feature('TRANSCRIPT_CLASSIFIER')
    ? true
    : false

  void runReplInitialMessageShell({
    initialMessage: pending,
    clearContextForInitialMessage: options.clearContextForInitialMessage,
    setAppState: options.setAppState,
    shouldRestrictAutoPermissions,
    createFileHistorySnapshot: options.createFileHistorySnapshot,
    awaitPendingHooks: options.awaitPendingHooks,
    submitInitialPrompt: options.submitInitialPrompt,
    createAbortController: options.createAbortController,
    setAbortController: options.setAbortController,
    dispatchInitialMessage: options.dispatchInitialMessage,
    scheduleProcessingReset: options.scheduleProcessingReset,
  })

  return true
}
