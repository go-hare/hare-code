import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type {
  ServerLaunchDeps,
  ServerLaunchOptions,
} from '../serverLauncher.js'

function createServerLaunchOptions(): ServerLaunchOptions {
  return {
    input: {
      port: '0',
      host: '0.0.0.0',
      authToken: undefined,
      unix: undefined,
      workspace: '/tmp/workspace',
      idleTimeoutMs: '600000',
      maxSessions: '32',
    },
    createAuthToken: () => 'generated-token',
  }
}

function createServerLaunchDeps() {
  const signalHandlers = new Map<string, () => void>()
  const stop = mock((_closeActiveConnections: boolean) => {})
  const destroyAll = mock(async () => {})
  const deps: ServerLaunchDeps = {
    assembleServerHost: mock((_input) => ({
      authToken: 'generated-token',
      config: {
        port: 0,
        host: '0.0.0.0',
        authToken: 'generated-token',
        workspace: '/tmp/workspace',
        idleTimeoutMs: 600000,
        maxSessions: 32,
      },
      sessionManager: {
        destroyAll,
      } as never,
      logger: { warn: mock(() => {}) } as never,
      server: {
        port: 4310,
        stop,
      } as never,
    })),
    probeRunningServer: mock(async () => null),
    writeServerLock: mock(async (_info) => {}),
    removeServerLock: mock(async () => {}),
    printBanner: mock((_config, _authToken, _actualPort) => {}),
    writeStderr: mock((_message: string) => {}),
    once: mock((signal: 'SIGINT' | 'SIGTERM', handler: () => void) => {
      signalHandlers.set(signal, handler)
    }),
    exit: mock((_code: number) => {}),
    pid: 4321,
    now: mock(() => 1234567890),
  }

  return {
    deps,
    signalHandlers,
    stop,
    destroyAll,
  }
}

const { runServerLaunch } = await import('../serverLauncher.js')

describe('runServerLaunch', () => {
  beforeEach(() => {
    mock.restore()
  })

  test('assembles the server host, writes the lock, and wires shutdown handlers', async () => {
    const options = createServerLaunchOptions()
    const { deps, signalHandlers, stop, destroyAll } = createServerLaunchDeps()

    await runServerLaunch(options, deps)

    expect(deps.probeRunningServer).toHaveBeenCalledTimes(1)
    expect(deps.assembleServerHost).toHaveBeenCalledWith({
      ...options.input,
      createAuthToken: options.createAuthToken,
    })
    expect(deps.printBanner).toHaveBeenCalledWith(
      {
        port: 0,
        host: '0.0.0.0',
        authToken: 'generated-token',
        workspace: '/tmp/workspace',
        idleTimeoutMs: 600000,
        maxSessions: 32,
      },
      'generated-token',
      4310,
    )
    expect(deps.writeServerLock).toHaveBeenCalledWith({
      pid: 4321,
      port: 4310,
      host: '0.0.0.0',
      httpUrl: 'http://0.0.0.0:4310',
      startedAt: 1234567890,
    })
    expect(deps.once).toHaveBeenCalledTimes(2)
    expect(signalHandlers.has('SIGINT')).toBe(true)
    expect(signalHandlers.has('SIGTERM')).toBe(true)

    signalHandlers.get('SIGINT')?.()
    await Promise.resolve()
    await Promise.resolve()
    signalHandlers.get('SIGTERM')?.()
    await Promise.resolve()
    await Promise.resolve()

    expect(stop).toHaveBeenCalledTimes(1)
    expect(stop).toHaveBeenCalledWith(true)
    expect(destroyAll).toHaveBeenCalledTimes(1)
    expect(deps.removeServerLock).toHaveBeenCalledTimes(1)
    expect(deps.exit).toHaveBeenCalledTimes(1)
    expect(deps.exit).toHaveBeenCalledWith(0)
  })

  test('short-circuits when an existing server lock is present', async () => {
    const options = createServerLaunchOptions()
    const { deps } = createServerLaunchDeps()

    ;(deps.probeRunningServer as ReturnType<typeof mock>).mockImplementationOnce(
      async () => ({
        pid: 9876,
        port: 4310,
        host: '127.0.0.1',
        httpUrl: 'http://127.0.0.1:4310',
        startedAt: 1234567890,
      }),
    )

    await runServerLaunch(options, deps)

    expect(deps.writeStderr).toHaveBeenCalledWith(
      'A claude server is already running (pid 9876) at http://127.0.0.1:4310\n',
    )
    expect(deps.exit).toHaveBeenCalledWith(1)
    expect(deps.assembleServerHost).toHaveBeenCalledTimes(0)
    expect(deps.printBanner).toHaveBeenCalledTimes(0)
    expect(deps.writeServerLock).toHaveBeenCalledTimes(0)
    expect(deps.once).toHaveBeenCalledTimes(0)
  })
})
