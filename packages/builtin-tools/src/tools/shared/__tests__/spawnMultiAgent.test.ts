import { afterEach, describe, expect, mock, test } from 'bun:test'

const cleanupFns = new Set<() => Promise<void>>()
const registerTaskMock = mock(((): any => {}) as any)
const ensureBackendsRegisteredMock = mock(async () => {})
const killPaneMock = mock(async () => true)

mock.module('src/utils/cleanupRegistry.js', () => ({
  registerCleanup: (cleanupFn: () => Promise<void>) => {
    cleanupFns.add(cleanupFn)
    return () => {
      cleanupFns.delete(cleanupFn)
    }
  },
  runCleanupFunctions: async () => {
    await Promise.all(Array.from(cleanupFns).map(fn => fn()))
  },
}))

mock.module('src/utils/task/framework.js', () => ({
  PANEL_GRACE_MS: 30000,
  POLL_INTERVAL_MS: 1000,
  STOPPED_DISPLAY_MS: 3000,
  applyTaskOffsetsAndEvictions: mock((state: any) => state),
  evictTerminalTask: mock(() => {}),
  generateTaskAttachments: mock(async () => ({ attachments: [], aborted: [] })),
  getRunningTasks: mock(() => []),
  pollTasks: mock(async () => {}),
  registerTask: registerTaskMock,
  updateTaskState: mock((_: string, __: any, updater: (task: any) => any) =>
    updater({}),
  ),
}))

mock.module('src/utils/swarm/backends/registry.js', () => ({
  detectAndGetBackend: mock(async () => {
    throw new Error('not used in this test')
  }),
  ensureBackendsRegistered: ensureBackendsRegisteredMock,
  getBackendByType: () => ({
    killPane: killPaneMock,
  }),
  isInProcessEnabled: mock(() => false),
  markInProcessFallback: mock(() => {}),
  resetBackendDetection: mock(() => {}),
}))

const {
  _registerOutOfProcessTeammateTaskForTesting,
  _resetTrackedPaneCleanupForTesting,
} = await import('../spawnMultiAgent.js')

async function runRegisteredCleanup(): Promise<void> {
  await Promise.all(Array.from(cleanupFns).map(fn => fn()))
}

describe('out-of-process teammate cleanup tracking', () => {
  afterEach(() => {
    registerTaskMock.mockReset()
    ensureBackendsRegisteredMock.mockReset()
    killPaneMock.mockReset()
    cleanupFns.clear()
    _resetTrackedPaneCleanupForTesting()
    ensureBackendsRegisteredMock.mockImplementation(async () => {})
    killPaneMock.mockImplementation(async () => true)
  })

  test('kills tracked pane teammates during leader-exit cleanup', async () => {
    _registerOutOfProcessTeammateTaskForTesting(() => {}, {
      teammateId: 'worker@alpha',
      sanitizedName: 'worker',
      teamName: 'alpha',
      teammateColor: 'blue',
      prompt: 'do work',
      paneId: '%12',
      insideTmux: false,
      backendType: 'tmux',
    })

    await runRegisteredCleanup()

    expect(ensureBackendsRegisteredMock).toHaveBeenCalled()
    expect(killPaneMock).toHaveBeenCalledWith('%12', true)
  })

  test('unregisters tracked cleanup after local abort to avoid double-kill', async () => {
    let registeredTask: any
    registerTaskMock.mockImplementation((taskState: any) => {
      registeredTask = taskState
    })

    _registerOutOfProcessTeammateTaskForTesting(() => {}, {
      teammateId: 'worker@alpha',
      sanitizedName: 'worker',
      teamName: 'alpha',
      teammateColor: 'blue',
      prompt: 'do work',
      paneId: '%12',
      insideTmux: false,
      backendType: 'tmux',
    })

    registeredTask.abortController.abort()
    await Promise.resolve()
    expect(killPaneMock).toHaveBeenCalledTimes(1)

    await runRegisteredCleanup()
    expect(killPaneMock).toHaveBeenCalledTimes(1)
  })
})
