import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import { BridgeFatalError } from '../../bridge/bridgeApi.js'

const mockRunHeadlessBridgeRuntime = mock(async () => {})
const mockCreateSessionSpawner = mock(() => ({ spawn: mock(() => {}) }))
const mockCreateBridgeSessionRuntime = mock(async () => 'session-1')
const mockGetBridgeSessionRuntime = mock(async (): Promise<any> => null)
const mockWriteBridgePointer = mock(async () => {})
const mockClearBridgePointer = mock(async () => {})
const mockTimerUnref = mock(() => {})
const mockTimer = { unref: mockTimerUnref } as unknown as ReturnType<
  typeof setInterval
>
const originalSetInterval = globalThis.setInterval
const originalClearInterval = globalThis.clearInterval
const mockSetInterval = mock(() => mockTimer)
const mockClearInterval = mock(() => {})
const lastLogger = {
  current: null as
    | {
        setRepoInfo: ReturnType<typeof mock>
        setSpawnModeDisplay: ReturnType<typeof mock>
      }
    | null,
}
const mockCreateBridgeLogger = mock(() => {
  const logger = {
    setRepoInfo: mock(() => {}),
    setSpawnModeDisplay: mock(() => {}),
  }
  lastLogger.current = logger
  return logger
})

mock.module('../../runtime/capabilities/bridge/HeadlessBridgeEntry.js', () => ({
  runHeadlessBridgeRuntime: mockRunHeadlessBridgeRuntime,
}))
mock.module('../../bridge/sessionRunner.js', () => ({
  createSessionSpawner: mockCreateSessionSpawner,
}))
mock.module('../../bridge/bridgeUI.js', () => ({
  createBridgeLogger: mockCreateBridgeLogger,
}))
mock.module('../../runtime/capabilities/bridge/SessionApi.js', () => ({
  archiveBridgeSessionRuntime: mock(async () => {}),
  createBridgeSessionRuntime: mockCreateBridgeSessionRuntime,
  getBridgeSessionRuntime: mockGetBridgeSessionRuntime,
  updateBridgeSessionTitleRuntime: mock(async () => {}),
}))
mock.module('../../bridge/bridgePointer.js', () => ({
  writeBridgePointer: mockWriteBridgePointer,
  clearBridgePointer: mockClearBridgePointer,
}))

const {
  assembleBridgeCliHost,
  BridgeCliRegistrationError,
  BridgeCliResumeReconnectError,
  BridgeCliResumeError,
  createBridgeCliHostControls,
  createBridgeCliInitialSession,
  createBridgeHeadlessDeps,
  registerBridgeCliEnvironment,
  resolveBridgeCliResumeRegistration,
  resolveBridgeCliResumeReconnect,
  runBridgeHeadless,
  startBridgeCliPointerRefresh,
} = await import('../bridge.js')

describe('kernel bridge surface', () => {
  globalThis.setInterval = mockSetInterval as unknown as typeof setInterval
  globalThis.clearInterval = mockClearInterval as unknown as typeof clearInterval

  beforeEach(() => {
    mockRunHeadlessBridgeRuntime.mockClear()
    mockCreateSessionSpawner.mockClear()
    mockCreateBridgeSessionRuntime.mockClear()
    mockGetBridgeSessionRuntime.mockClear()
    mockWriteBridgePointer.mockClear()
    mockClearBridgePointer.mockClear()
    mockCreateBridgeLogger.mockClear()
    mockSetInterval.mockClear()
    mockClearInterval.mockClear()
    mockTimerUnref.mockClear()
    lastLogger.current = null
  })

  test('assembles bridge cli host dependencies in kernel', async () => {
    const assembly = await assembleBridgeCliHost({
      dir: '/tmp/work/project',
      branch: 'main',
      gitRepoUrl: 'https://github.com/acme/project.git',
      spawnMode: 'worktree',
      worktreeAvailable: true,
      verbose: true,
      sandbox: false,
      permissionMode: 'default',
      onDebug: mock(() => {}),
    })

    expect(mockCreateSessionSpawner).toHaveBeenCalledTimes(1)
    expect(mockCreateBridgeLogger).toHaveBeenCalledTimes(1)
    expect(assembly.logger).toBeDefined()
    expect(assembly.spawner).toBeDefined()
    expect(lastLogger.current).not.toBeNull()
    expect(assembly.logger.setRepoInfo).toBe(lastLogger.current!.setRepoInfo)
    expect(assembly.toggleAvailable).toBe(true)
    expect(lastLogger.current?.setRepoInfo).toHaveBeenCalledWith(
      'project',
      'main',
    )
    expect(lastLogger.current?.setSpawnModeDisplay).toHaveBeenCalledWith(
      'worktree',
    )
  })

  test('creates initial bridge session through kernel helper', async () => {
    const onDebug = mock(() => {})

    const sessionId = await createBridgeCliInitialSession({
      preCreateSession: true,
      environmentId: 'env-1',
      title: 'repo',
      gitRepoUrl: 'https://github.com/acme/project.git',
      branch: 'main',
      signal: new AbortController().signal,
      baseUrl: 'https://example.com',
      getAccessToken: () => 'token',
      permissionMode: 'acceptEdits',
      onDebug,
    })

    expect(sessionId).toBe('session-1')
    expect(mockCreateBridgeSessionRuntime).toHaveBeenCalledTimes(1)
    expect(onDebug).toHaveBeenCalledWith(
      '[bridge:init] Created initial session session-1',
    )
  })

  test('reuses resumed bridge session without pre-creating a new one', async () => {
    const sessionId = await createBridgeCliInitialSession({
      resumeSessionId: 'resume-1',
      preCreateSession: true,
      environmentId: 'env-1',
      title: 'repo',
      gitRepoUrl: null,
      branch: 'main',
      signal: new AbortController().signal,
      baseUrl: 'https://example.com',
      getAccessToken: () => 'token',
      onDebug: mock(() => {}),
    })

    expect(sessionId).toBe('resume-1')
    expect(mockCreateBridgeSessionRuntime).toHaveBeenCalledTimes(0)
  })

  test('resolves bridge resume registration through kernel helper', async () => {
    mockGetBridgeSessionRuntime.mockResolvedValueOnce({
      environment_id: 'env-1',
    })
    const refreshAccessTokenIfNeeded = mock(async () => {})
    const clearAccessTokenCache = mock(() => {})
    const onDebug = mock(() => {})

    const reuseEnvironmentId = await resolveBridgeCliResumeRegistration({
      resumeSessionId: 'session-1',
      baseUrl: 'https://example.com',
      getAccessToken: () => 'token',
      refreshAccessTokenIfNeeded,
      clearAccessTokenCache,
      onDebug,
    })

    expect(reuseEnvironmentId).toBe('env-1')
    expect(refreshAccessTokenIfNeeded).toHaveBeenCalledTimes(1)
    expect(clearAccessTokenCache).toHaveBeenCalledTimes(1)
    expect(mockGetBridgeSessionRuntime).toHaveBeenCalledWith('session-1', {
      baseUrl: 'https://example.com',
      getAccessToken: expect.any(Function),
    })
    expect(onDebug).toHaveBeenCalledWith(
      '[bridge:init] Resuming session session-1 on environment env-1',
    )
  })

  test('maps bridge registration 404 through kernel helper', async () => {
    await expect(
      registerBridgeCliEnvironment({
        api: {
          registerBridgeEnvironment: mock(async () => {
            throw new BridgeFatalError('not found', 404)
          }),
        },
        config: {} as any,
      }),
    ).rejects.toMatchObject({
      name: 'BridgeCliRegistrationError',
      status: 404,
      message: 'Remote Control environments are not available for your account.',
    })
  })

  test('clears stale bridge pointer when resumed session is missing', async () => {
    mockGetBridgeSessionRuntime.mockResolvedValueOnce(null)

    await expect(
      resolveBridgeCliResumeRegistration({
        resumeSessionId: 'session-1',
        resumePointerDir: '/tmp/work/project',
        baseUrl: 'https://example.com',
        getAccessToken: () => 'token',
        onDebug: mock(() => {}),
      }),
    ).rejects.toMatchObject({
      name: 'BridgeCliResumeError',
      code: 'session_not_found',
    })

    expect(mockClearBridgePointer).toHaveBeenCalledWith('/tmp/work/project')
  })

  test('returns warning when resumed environment no longer matches', async () => {
    const onEnvMismatch = mock(() => {})

    const result = await resolveBridgeCliResumeReconnect({
      api: {
        reconnectSession: mock(async () => {}),
      },
      environmentId: 'env-2',
      reuseEnvironmentId: 'env-1',
      resumeSessionId: 'session-1',
      onDebug: mock(() => {}),
      onEnvMismatch,
    })

    expect(result.effectiveResumeSessionId).toBeUndefined()
    expect(result.warningMessage).toContain('Creating a fresh session instead.')
    expect(onEnvMismatch).toHaveBeenCalledWith('env-1', 'env-2')
  })

  test('throws typed reconnect error and clears pointer on fatal failure', async () => {
    await expect(
      resolveBridgeCliResumeReconnect({
        api: {
          reconnectSession: mock(async () => {
            throw new BridgeFatalError('environment expired', 410)
          }),
        },
        environmentId: 'env-1',
        reuseEnvironmentId: 'env-1',
        resumeSessionId: 'session-1',
        resumePointerDir: '/tmp/work/project',
        onDebug: mock(() => {}),
      }),
    ).rejects.toMatchObject({
      name: 'BridgeCliResumeReconnectError',
      fatal: true,
    })

    expect(mockClearBridgePointer).toHaveBeenCalledWith('/tmp/work/project')
  })

  test('starts single-session bridge pointer refresh through kernel helper', async () => {
    const refresh = await startBridgeCliPointerRefresh({
      dir: '/tmp/work/project',
      sessionId: 'session-1',
      environmentId: 'env-1',
      spawnMode: 'single-session',
    })

    expect(mockWriteBridgePointer).toHaveBeenCalledTimes(1)
    expect(mockWriteBridgePointer).toHaveBeenCalledWith('/tmp/work/project', {
      sessionId: 'session-1',
      environmentId: 'env-1',
      source: 'standalone',
    })
    expect(mockSetInterval).toHaveBeenCalledTimes(1)
    expect(mockTimerUnref).toHaveBeenCalledTimes(1)

    refresh?.stop()
    expect(mockClearInterval).toHaveBeenCalledTimes(1)
    expect(mockClearInterval).toHaveBeenCalledWith(mockTimer)
  })

  test('skips pointer refresh outside single-session mode', async () => {
    const refresh = await startBridgeCliPointerRefresh({
      dir: '/tmp/work/project',
      sessionId: 'session-1',
      environmentId: 'env-1',
      spawnMode: 'worktree',
    })

    expect(refresh).toBeNull()
    expect(mockWriteBridgePointer).toHaveBeenCalledTimes(0)
    expect(mockSetInterval).toHaveBeenCalledTimes(0)
  })

  test('toggles spawn mode through kernel-owned host controls', () => {
    const config = { spawnMode: 'same-dir' as 'same-dir' | 'worktree' }
    const logger = {
      toggleQr: mock(() => {}),
      logStatus: mock(() => {}),
      setSpawnModeDisplay: mock(() => {}),
      refreshDisplay: mock(() => {}),
    }
    const onSpawnModeToggled = mock(() => {})
    const persistSpawnMode = mock(() => {})

    const controls = createBridgeCliHostControls({
      logger,
      toggleAvailable: true,
      config,
      onDebug: mock(() => {}),
      onSpawnModeToggled,
      persistSpawnMode,
    })

    controls.onStdinData(Buffer.from([0x77]))

    expect(config.spawnMode).toBe('worktree')
    expect(onSpawnModeToggled).toHaveBeenCalledWith('worktree')
    expect(logger.logStatus).toHaveBeenCalledTimes(1)
    expect(logger.setSpawnModeDisplay).toHaveBeenCalledWith('worktree')
    expect(logger.refreshDisplay).toHaveBeenCalledTimes(1)
    expect(persistSpawnMode).toHaveBeenCalledWith('worktree')
  })

  test('aborts bridge host controls on ctrl+c', () => {
    const controls = createBridgeCliHostControls({
      logger: {
        toggleQr: mock(() => {}),
        logStatus: mock(() => {}),
        setSpawnModeDisplay: mock(() => {}),
        refreshDisplay: mock(() => {}),
      },
      toggleAvailable: false,
      config: { spawnMode: 'single-session' },
      onDebug: mock(() => {}),
    })

    expect(controls.controller.signal.aborted).toBe(false)
    controls.onStdinData(Buffer.from([0x03]))
    expect(controls.controller.signal.aborted).toBe(true)
  })

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

afterAll(() => {
  globalThis.setInterval = originalSetInterval
  globalThis.clearInterval = originalClearInterval
})
