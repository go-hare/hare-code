import { describe, expect, mock, test } from 'bun:test'

const mockRunDaemonWorkerRuntime = mock(async () => {})
const mockRunBridgeHeadless = mock(async () => {})

class MockBridgeHeadlessPermanentError extends Error {
  constructor(message = 'permanent') {
    super(message)
    this.name = 'BridgeHeadlessPermanentError'
  }
}

mock.module('../../runtime/capabilities/daemon/DaemonWorkerRuntime.js', () => ({
  EXIT_CODE_PERMANENT: 78,
  EXIT_CODE_TRANSIENT: 1,
  buildRemoteControlWorkerConfigFromEnv: mock(() => ({})),
  runDaemonWorkerRuntime: mockRunDaemonWorkerRuntime,
  runRemoteControlWorkerRuntime: mock(async () => {}),
}))

mock.module('../bridge.js', () => ({
  runBridgeHeadless: mockRunBridgeHeadless,
  BridgeHeadlessPermanentError: MockBridgeHeadlessPermanentError,
}))

const { createDaemonWorkerDeps, runDaemonWorker } = await import('../daemon.js')

describe('kernel daemon surface', () => {
  test('assembles daemon worker deps in kernel', () => {
    const deps = createDaemonWorkerDeps()

    expect(deps.runBridgeHeadless).toBe(mockRunBridgeHeadless)
    expect(
      deps.isPermanentError(new MockBridgeHeadlessPermanentError()),
    ).toBe(true)
    expect(deps.isPermanentError(new Error('transient'))).toBe(false)
  })

  test('delegates daemon worker execution through kernel-owned deps', async () => {
    await runDaemonWorker('bridge')

    expect(mockRunDaemonWorkerRuntime).toHaveBeenCalledTimes(1)
    const call = mockRunDaemonWorkerRuntime.mock.calls[0] as unknown as
      | [string | undefined, ReturnType<typeof createDaemonWorkerDeps>]
      | undefined
    expect(call?.[0]).toBe('bridge')
    expect(call?.[1]?.runBridgeHeadless).toBe(mockRunBridgeHeadless)
    expect(
      call?.[1]?.isPermanentError(new MockBridgeHeadlessPermanentError()),
    ).toBe(true)
  })
})
