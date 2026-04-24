import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type {
  ComputerUseSessionContext,
  CuPermissionRequest,
  CuPermissionResponse,
} from '@ant/computer-use-mcp'
import { DEFAULT_GRANT_FLAGS } from '@ant/computer-use-mcp'
import type { ToolUseContext } from '../../../Tool.js'
import type { ThinkingConfig } from '../../thinking.js'

const bindSessionContextMock = mock(
  (
    _adapter: unknown,
    _mode: unknown,
    _ctx: ComputerUseSessionContext,
  ) => async () => ({ content: [] }),
)

mock.module('@ant/computer-use-mcp', async () => {
  return {
    bindSessionContext: bindSessionContextMock,
    DEFAULT_GRANT_FLAGS,
  }
})

mock.module('../../debug.js', () => ({
  logForDebugging: mock(() => {}),
  logAntError: mock(() => {}),
  isDebugMode: mock(() => false),
  isDebugToStdErr: mock(() => false),
  getDebugLogPath: mock(() => 'debug.log'),
  flushDebugLogs: mock(async () => {}),
  enableDebugLogging: mock(() => false),
  getMinDebugLogLevel: mock(() => 'debug'),
  getDebugFilter: mock(() => null),
  setHasFormattedOutput: mock(() => {}),
  getHasFormattedOutput: mock(() => false),
}))

mock.module('../computerUseLock.js', () => ({
  checkComputerUseLock: mock(async () => ({ kind: 'free' })),
  tryAcquireComputerUseLock: mock(async () => ({ kind: 'acquired', fresh: true })),
}))

mock.module('../escHotkey.js', () => ({
  registerEscHotkey: mock(() => false),
}))

mock.module('../gates.js', () => ({
  getChicagoCoordinateMode: mock(() => 'screen'),
}))

mock.module('../hostAdapter.js', () => ({
  getComputerUseHostAdapter: mock(() => ({ serverName: 'computer-use' })),
}))

mock.module('../toolRendering.js', () => ({
  getComputerUseMCPRenderingOverrides: mock(() => ({})),
}))

const { getComputerUseMCPToolOverrides, resetComputerUseWrapperStateForTests } =
  await import('../wrapper.js')

type ElicitHandler = NonNullable<ToolUseContext['handleElicitation']>

function createRequest(overrides: Partial<CuPermissionRequest> = {}): CuPermissionRequest {
  return {
    requestId: 'req-1',
    reason: 'Open Notepad and take a screenshot',
    apps: [
      {
        requestedName: 'Notepad',
        resolved: {
          bundleId: 'notepad.exe',
          displayName: 'Notepad',
          path: 'C:/Windows/notepad.exe',
        },
        isSentinel: false,
        alreadyGranted: false,
        proposedTier: 'full',
      },
      {
        requestedName: 'Missing App',
        isSentinel: false,
        alreadyGranted: false,
        proposedTier: 'read',
      },
    ],
    requestedFlags: {
      clipboardRead: true,
      systemKeyCombos: true,
    },
    screenshotFiltering: 'none',
    ...overrides,
  }
}

function createContext(overrides: Partial<ToolUseContext> = {}): ToolUseContext {
  return {
    options: {
      commands: [],
      debug: false,
      mainLoopModel: 'test-model',
      tools: [],
      verbose: false,
      thinkingConfig: { type: 'disabled' } satisfies ThinkingConfig,
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: true,
      agentDefinitions: {
        activeAgents: [],
        allAgents: [],
      },
    },
    abortController: new AbortController(),
    readFileState: {} as ToolUseContext['readFileState'],
    getAppState: () => ({ computerUseMcpState: undefined }) as ReturnType<ToolUseContext['getAppState']>,
    setAppState: mock(() => {}),
    setInProgressToolUseIDs: mock(() => {}),
    setResponseLength: mock(() => {}),
    updateFileHistoryState: mock(() => {}),
    updateAttributionState: mock(() => {}),
    messages: [],
    handleElicitation: mock(async () => ({ action: 'accept' })) as ElicitHandler,
    ...overrides,
  }
}

describe('computer-use wrapper headless approval', () => {
  beforeEach(() => {
    bindSessionContextMock.mockReset()
    resetComputerUseWrapperStateForTests()
  })

  test('maps headless accept to grants, flags, and not-installed denials', async () => {
    let onPermissionRequest:
      | ((
          req: CuPermissionRequest,
          signal: AbortSignal,
        ) => Promise<CuPermissionResponse>)
      | undefined

    bindSessionContextMock.mockImplementation(
      (_adapter: unknown, _mode: unknown, ctx: ComputerUseSessionContext) => {
        onPermissionRequest = ctx.onPermissionRequest
        return async () => ({ content: [] })
      },
    )

    const elicitation = mock(async () => ({ action: 'accept' as const }))
    const context = createContext({ handleElicitation: elicitation as ElicitHandler })
    const tool = getComputerUseMCPToolOverrides('request_access')
    await tool.call?.({}, context, undefined as never, undefined as never)

    const response = await onPermissionRequest!(
      createRequest(),
      context.abortController.signal,
    )

    expect(elicitation).toHaveBeenCalledTimes(1)
    const firstCall = elicitation.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
      AbortSignal,
    ]
    const [serverName, elicitationParams] = firstCall
    expect(serverName).toBe('computer-use')
    expect(elicitationParams).toMatchObject({
      mode: 'form',
      requestedSchema: {
        type: 'object',
        properties: {},
      },
    })
    expect(response.granted).toHaveLength(1)
    expect(response.granted[0]).toMatchObject({
      bundleId: 'notepad.exe',
      displayName: 'Notepad',
      tier: 'full',
    })
    expect(typeof response.granted[0]?.grantedAt).toBe('number')
    expect(response.denied).toEqual([
      {
        bundleId: 'Missing App',
        reason: 'not_installed',
      },
    ])
    expect(response.flags).toEqual({
      ...DEFAULT_GRANT_FLAGS,
      clipboardRead: true,
      systemKeyCombos: true,
    })
  })

  test('maps headless decline to deny-all response', async () => {
    let onPermissionRequest:
      | ((
          req: CuPermissionRequest,
          signal: AbortSignal,
        ) => Promise<CuPermissionResponse>)
      | undefined

    bindSessionContextMock.mockImplementation(
      (_adapter: unknown, _mode: unknown, ctx: ComputerUseSessionContext) => {
        onPermissionRequest = ctx.onPermissionRequest
        return async () => ({ content: [] })
      },
    )

    const context = createContext({
      handleElicitation: mock(async () => ({ action: 'decline' as const })) as ElicitHandler,
    })
    const tool = getComputerUseMCPToolOverrides('request_access')
    await tool.call?.({}, context, undefined as never, undefined as never)

    const response = await onPermissionRequest!(
      createRequest(),
      context.abortController.signal,
    )

    expect(response).toEqual({
      granted: [],
      denied: [],
      flags: DEFAULT_GRANT_FLAGS,
    })
  })

  test('skips elicitation and denies immediately when TCC is missing', async () => {
    let onPermissionRequest:
      | ((
          req: CuPermissionRequest,
          signal: AbortSignal,
        ) => Promise<CuPermissionResponse>)
      | undefined

    bindSessionContextMock.mockImplementation(
      (_adapter: unknown, _mode: unknown, ctx: ComputerUseSessionContext) => {
        onPermissionRequest = ctx.onPermissionRequest
        return async () => ({ content: [] })
      },
    )

    const elicitation = mock(async () => ({ action: 'accept' as const }))
    const context = createContext({ handleElicitation: elicitation as ElicitHandler })
    const tool = getComputerUseMCPToolOverrides('request_access')
    await tool.call?.({}, context, undefined as never, undefined as never)

    const response = await onPermissionRequest!(
      createRequest({
        apps: [],
        requestedFlags: {},
        tccState: {
          accessibility: false,
          screenRecording: false,
        },
      }),
      context.abortController.signal,
    )

    expect(elicitation).toHaveBeenCalledTimes(0)
    expect(response).toEqual({
      granted: [],
      denied: [],
      flags: DEFAULT_GRANT_FLAGS,
    })
  })
})
