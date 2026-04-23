import { describe, expect, mock, test } from 'bun:test'

const mockRunHeadlessBridgeRuntime = mock(async () => {})

mock.module('../../runtime/capabilities/bridge/HeadlessBridgeEntry.js', () => ({
  runHeadlessBridgeRuntime: mockRunHeadlessBridgeRuntime,
}))

const { createBridgeHeadlessDeps, runBridgeHeadless } = await import('../bridge.js')

describe('kernel bridge surface', () => {
  test('assembles default headless bridge deps in kernel', () => {
    const runBridgeLoop = mock(async () => {})
    const deps = createBridgeHeadlessDeps(runBridgeLoop as never)

    expect(deps.bridgeLoginError).toBeString()
    expect(deps.runBridgeLoop).toBe(runBridgeLoop)
    expect(typeof deps.getBaseUrl).toBe('function')
    expect(typeof deps.createSpawner).toBe('function')
    expect(typeof deps.createInitialSession).toBe('function')
  })

  test('delegates headless bridge entry through kernel-owned deps', async () => {
    const runBridgeLoop = mock(async () => {})
    const signal = new AbortController().signal
    const opts = {
      dir: '/tmp/project',
      spawnMode: 'same-dir' as const,
      capacity: 1,
      sandbox: false,
      createSessionOnStart: false,
      getAccessToken: () => 'token',
      onAuth401: async () => false,
      log: mock(() => {}),
    }

    await runBridgeHeadless(opts, signal, runBridgeLoop as never)

    expect(mockRunHeadlessBridgeRuntime).toHaveBeenCalledTimes(1)
    const call = mockRunHeadlessBridgeRuntime.mock.calls[0] as unknown as
      | [typeof opts, AbortSignal, ReturnType<typeof createBridgeHeadlessDeps>]
      | undefined
    expect(call?.[0]).toBe(opts)
    expect(call?.[1]).toBe(signal)
    expect(call?.[2]?.runBridgeLoop).toBe(runBridgeLoop)
  })
})
