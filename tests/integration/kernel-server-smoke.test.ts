import { beforeEach, describe, expect, mock, test } from 'bun:test'

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

mock.module('../../src/server/createDirectConnectSession.js', () => ({
  createDirectConnectSession: mockCreateDirectConnectSession,
  DirectConnectError: MockDirectConnectError,
}))

mock.module('../../src/server/server.js', () => ({
  startServer: mockStartServer,
}))

mock.module('../../src/server/sessionManager.js', () => ({
  SessionManager: MockSessionManager,
}))

mock.module('../../src/server/backends/dangerousBackend.js', () => ({
  DangerousBackend: mock(() => mockDangerousBackendInstance),
}))

mock.module('../../src/server/serverLog.js', () => ({
  createServerLogger: mockCreateServerLogger,
}))

const {
  assembleServerHost,
  connectDirectHostSession,
  createDirectConnectSession,
} = await import('../../src/kernel/index.js')

describe('kernel server smoke', () => {
  beforeEach(() => {
    mockCreateDirectConnectSession.mockClear()
    mockStartServer.mockClear()
    mockCreateServerLogger.mockClear()
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
