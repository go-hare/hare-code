import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

const mockCreateDirectConnectSession = mock(async () => ({
  config: {
    sessionId: 'session_123',
    serverUrl: 'http://127.0.0.1:9000',
    wsUrl: 'ws://127.0.0.1:9000/sessions/session_123/ws',
  },
  workDir: '/tmp/workdir',
}))
const mockStartServer = mock(() => ({
  port: 0,
  stop: mock((_closeActiveConnections: boolean) => {}),
}))
const mockCreateServerLogger = mock(() => ({
  warn: mock(() => {}),
}))
const mockDangerousBackendInstance = { kind: 'backend' }
const mockRunConnectHeadlessRuntime = mock(async () => {})

const MockSessionManager = mock(function MockSessionManager(
  this: Record<string, unknown>,
  backend: unknown,
  options: unknown,
) {
  this.backend = backend
  this.options = options
  this.destroyAll = mock(async () => {})
})

class MockDirectConnectError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DirectConnectError'
  }
}

mock.module('../../src/kernel/serverHostDeps.js', () => ({
  createDirectConnectSessionCompat: mockCreateDirectConnectSession,
  DirectConnectError: MockDirectConnectError,
  startServerHost: mockStartServer,
  SessionManager: MockSessionManager,
  DangerousBackend: mock(() => mockDangerousBackendInstance),
  createServerLogger: mockCreateServerLogger,
  runConnectHeadlessRuntime: mockRunConnectHeadlessRuntime,
}))

const {
  assembleServerHost,
  connectDirectHostSession,
  createDirectConnectSession,
} = await import('../../src/kernel/serverHost.js')

afterEach(() => {
  mock.restore()
})

describe('kernel server smoke', () => {
  beforeEach(() => {
    mockCreateDirectConnectSession.mockClear()
    mockStartServer.mockClear()
    mockCreateServerLogger.mockClear()
    mockRunConnectHeadlessRuntime.mockClear()
    MockSessionManager.mockClear()
  })

  test('supports direct-connect and server assembly through the kernel surface only', async () => {
    const setOriginalCwd = mock(() => {})
    const setCwdState = mock(() => {})
    const setDirectConnectServerUrl = mock(() => {})

    const directConfig = await connectDirectHostSession(
      {
        serverUrl: 'http://127.0.0.1:9000',
        authToken: 'token',
        cwd: '/tmp/project',
        dangerouslySkipPermissions: false,
      },
      {
        setOriginalCwd,
        setCwdState,
        setDirectConnectServerUrl,
      },
    )

    expect(directConfig.sessionId).toBe('session_123')
    expect(setOriginalCwd).toHaveBeenCalledWith('/tmp/workdir')
    expect(setCwdState).toHaveBeenCalledWith('/tmp/workdir')
    expect(setDirectConnectServerUrl).toHaveBeenCalledWith(
      'http://127.0.0.1:9000',
    )

    const session = await createDirectConnectSession({
      serverUrl: 'http://127.0.0.1:9000',
      authToken: 'token',
      cwd: '/tmp/project',
      dangerouslySkipPermissions: false,
    })
    expect(session.state).toEqual({
      serverUrl: 'http://127.0.0.1:9000',
      workDir: '/tmp/workdir',
    })

    const assembly = assembleServerHost({
      port: '0',
      host: '127.0.0.1',
      idleTimeoutMs: '123',
      maxSessions: '9',
      createAuthToken: () => 'generated-token',
    })

    expect(MockSessionManager).toHaveBeenCalledWith(
      mockDangerousBackendInstance,
      {
        idleTimeoutMs: 123,
        maxSessions: 9,
      },
    )
    expect(mockCreateServerLogger).toHaveBeenCalledTimes(1)
    expect(mockStartServer).toHaveBeenCalledTimes(1)
    expect(assembly.config).toMatchObject({
      port: 0,
      host: '127.0.0.1',
      authToken: 'generated-token',
      idleTimeoutMs: 123,
      maxSessions: 9,
    })
  })
})
