import { describe, expect, mock, test } from 'bun:test'

const mockRunReplInitialMessageShell = mock(() => {})

mock.module('../../../replInitialMessageShell.js', () => ({
  runReplInitialMessageShell: mockRunReplInitialMessageShell,
}))

const { runReplInitialMessageController } = await import(
  '../runReplInitialMessageController.js'
)

describe('runReplInitialMessageController', () => {
  test('skips when there is no pending initial message or repl is loading', () => {
    const initialMessageRef = { current: false }

    const skippedForMissing = runReplInitialMessageController(
      createOptions({
        initialMessage: null,
        isLoading: false,
        initialMessageRef,
      }),
    )
    const skippedForLoading = runReplInitialMessageController(
      createOptions({
        initialMessage: {
          message: { uuid: 'user-1', message: { content: 'hello' } },
        } as any,
        isLoading: true,
        initialMessageRef,
      }),
    )

    expect(skippedForMissing).toBe(false)
    expect(skippedForLoading).toBe(false)
    expect(mockRunReplInitialMessageShell).toHaveBeenCalledTimes(0)
  })

  test('marks initial message as processing and delegates to shell', () => {
    const initialMessageRef = { current: false }

    const didRun = runReplInitialMessageController(
      createOptions({
        initialMessage: {
          message: { uuid: 'user-1', message: { content: 'hello' } },
          mode: 'acceptEdits',
        } as any,
        isLoading: false,
        initialMessageRef,
      }),
    )

    expect(didRun).toBe(true)
    expect(initialMessageRef.current).toBe(true)
    expect(mockRunReplInitialMessageShell).toHaveBeenCalledTimes(1)
    const firstCall = mockRunReplInitialMessageShell.mock.calls[0] as unknown as
      | [any]
      | undefined
    expect(firstCall?.[0]).toMatchObject({
      initialMessage: {
        message: { uuid: 'user-1', message: { content: 'hello' } },
      },
      shouldRestrictAutoPermissions: expect.any(Boolean),
    })
  })
})

function createOptions({
  initialMessage,
  isLoading,
  initialMessageRef,
}: {
  initialMessage: any
  isLoading: boolean
  initialMessageRef: { current: boolean }
}) {
  return {
    initialMessage,
    isLoading,
    initialMessageRef,
    clearContextForInitialMessage: mock(async (_initialMessage: unknown) => {}),
    setAppState: mock((_updater: unknown) => {}),
    createFileHistorySnapshot: mock((_messageUuid: string) => {}),
    awaitPendingHooks: mock(async () => {}),
    submitInitialPrompt: mock((_content: string) => {}),
    createAbortController: () => new AbortController(),
    setAbortController: mock((_controller: AbortController | null) => {}),
    dispatchInitialMessage: mock(
      (_message: unknown, _abortController: AbortController) => {},
    ),
    scheduleProcessingReset: mock(() => {}),
  } as any
}
