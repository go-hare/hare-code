import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type {
  HeadlessLaunchDeps,
  HeadlessLaunchOptions,
} from '../headlessLauncher.js'

const callOrder: string[] = []
const materializedEnvironment = {
  commands: [
    { name: 'prompt-ok', type: 'prompt', disableNonInteractive: false },
  ],
  tools: [{ name: 'Bash' }],
  sdkMcpConfigs: { local: { type: 'sdk', name: 'local' } },
  agents: [{ agentType: 'default', source: 'built-in' }],
  toolPermissionContext: { mode: 'default' },
}
const headlessEnvironment = {
  store: { name: 'headless-store' },
  commands: materializedEnvironment.commands,
  tools: materializedEnvironment.tools,
  sdkMcpConfigs: materializedEnvironment.sdkMcpConfigs,
  agents: materializedEnvironment.agents,
}

const mockMaterializeRuntimeHeadlessEnvironment = mock(
  async (_options: unknown) => {
    callOrder.push('materialize')
    return materializedEnvironment
  },
)
const mockCreateDefaultKernelHeadlessEnvironment = mock((_options: unknown) => {
  callOrder.push('create')
  return headlessEnvironment
})
const mockConnectDefaultKernelHeadlessMcp = mock(async (_options: unknown) => {
  callOrder.push('connect')
  return { claudeaiTimedOut: false }
})
const mockPrepareKernelHeadlessStartup = mock(
  async (_options: unknown, _deps: unknown) => {
    callOrder.push('prepare')
  },
)
const mockRunKernelHeadless = mock(
  async (_inputPrompt: unknown, _environment: unknown, _options: unknown) => {
    callOrder.push('run')
  },
)

const { runHeadlessLaunch } = await import('../headlessLauncher.js')

function createDeps(): HeadlessLaunchDeps {
  return {
    async materializeRuntimeHeadlessEnvironment(input) {
      return (await mockMaterializeRuntimeHeadlessEnvironment(
        input,
      )) as never
    },
    createDefaultKernelHeadlessEnvironment(options) {
      return mockCreateDefaultKernelHeadlessEnvironment(options) as never
    },
    async connectDefaultKernelHeadlessMcp(options) {
      return (await mockConnectDefaultKernelHeadlessMcp(options)) as never
    },
    async prepareKernelHeadlessStartup(options, deps) {
      await mockPrepareKernelHeadlessStartup(options, deps)
    },
    async runKernelHeadless(inputPrompt, environment, options) {
      await mockRunKernelHeadless(inputPrompt, environment, options)
    },
  }
}

function createHeadlessLaunchOptions(): HeadlessLaunchOptions {
  const claudeaiConfigPromise = Promise.resolve({
    remote: { type: 'sdk', name: 'remote', scope: 'local' },
  })

  return {
    inputPrompt: 'hello from launcher',
    environment: {
      commands: [
        { name: 'prompt-ok', type: 'prompt', disableNonInteractive: false },
      ],
      tools: [{ name: 'Bash' }],
      sdkMcpConfigs: {
        local: { type: 'sdk', name: 'local', scope: 'local' },
      },
      agents: [{ agentType: 'default', source: 'builtin' }],
      toolPermissionContext: { mode: 'default' },
      disableSlashCommands: false,
    } as never,
    regularMcpConfigs: {
      project: { type: 'stdio', command: 'echo', args: ['ok'], scope: 'local' },
    } as never,
    claudeaiConfigPromise: claudeaiConfigPromise as never,
    startup: {
      sessionPersistenceDisabled: false,
      betas: ['beta-1'],
      bareMode: false,
      userType: 'external',
    },
    startupDeps: {
      startDeferredPrefetches: mock(() => {}),
      logSessionTelemetry: mock(() => {}),
    },
    runOptions: {
      continue: false,
      resume: undefined,
      resumeSessionAt: undefined,
      verbose: false,
      outputFormat: 'text',
      jsonSchema: undefined,
      permissionPromptToolName: undefined,
      allowedTools: ['Bash'],
      thinkingConfig: undefined,
      maxTurns: 2,
      maxBudgetUsd: undefined,
      taskBudget: undefined,
      systemPrompt: undefined,
      appendSystemPrompt: undefined,
      userSpecifiedModel: 'claude-sonnet',
      fallbackModel: undefined,
      teleport: undefined,
      sdkUrl: undefined,
      replayUserMessages: undefined,
      includePartialMessages: undefined,
      forkSession: false,
      rewindFiles: undefined,
      enableAuthStatus: undefined,
      agent: undefined,
      workload: undefined,
      setupTrigger: undefined,
      sessionStartHooksPromise: undefined,
    },
    profileCheckpoint(checkpoint) {
      callOrder.push(`checkpoint:${checkpoint}`)
    },
  }
}

describe('runHeadlessLaunch', () => {
  beforeEach(() => {
    callOrder.length = 0
    mockMaterializeRuntimeHeadlessEnvironment.mockClear()
    mockCreateDefaultKernelHeadlessEnvironment.mockClear()
    mockConnectDefaultKernelHeadlessMcp.mockClear()
    mockPrepareKernelHeadlessStartup.mockClear()
    mockRunKernelHeadless.mockClear()
  })

  test('orchestrates headless kernel startup in the expected order', async () => {
    const options = createHeadlessLaunchOptions()
    const deps = createDeps()

    await runHeadlessLaunch(options, deps)

    expect(callOrder).toEqual([
      'materialize',
      'create',
      'checkpoint:before_connectMcp',
      'connect',
      'checkpoint:after_connectMcp',
      'checkpoint:after_connectMcp_claudeai',
      'prepare',
      'run',
    ])

    expect(mockMaterializeRuntimeHeadlessEnvironment).toHaveBeenCalledWith(
      options.environment,
    )
    expect(mockCreateDefaultKernelHeadlessEnvironment).toHaveBeenCalledWith(
      materializedEnvironment,
    )
    expect(mockConnectDefaultKernelHeadlessMcp).toHaveBeenCalledWith({
      store: headlessEnvironment.store,
      regularMcpConfigs: options.regularMcpConfigs,
      claudeaiConfigPromise: options.claudeaiConfigPromise,
    })
    expect(mockPrepareKernelHeadlessStartup).toHaveBeenCalledWith(
      options.startup,
      expect.objectContaining({
        ...options.startupDeps,
        stateWriter: expect.any(Object),
      }),
    )
    expect(mockRunKernelHeadless).toHaveBeenCalledWith(
      options.inputPrompt,
      headlessEnvironment,
      expect.objectContaining({
        ...options.runOptions,
        bootstrapStateProvider: expect.any(Object),
      }),
    )

    const startupDeps =
      mockPrepareKernelHeadlessStartup.mock.calls[0]?.[1] as Record<
        string,
        unknown
      >
    const runOptions =
      mockRunKernelHeadless.mock.calls[0]?.[2] as Record<string, unknown>
    expect(startupDeps.stateWriter).toBeDefined()
    expect(runOptions.bootstrapStateProvider).toBeDefined()
  })

  test('waits for the kernel run loop to finish before resolving', async () => {
    const options = createHeadlessLaunchOptions()
    const deps = createDeps()
    let releaseRun: (() => void) | undefined

    mockRunKernelHeadless.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          callOrder.push('run')
          releaseRun = resolve
        }),
    )

    const launchPromise = runHeadlessLaunch(options, deps).then(
      () => 'launch-finished',
    )
    const result = await Promise.race([
      launchPromise,
      new Promise<string>(resolve => {
        setTimeout(() => resolve('timed-out'), 50)
      }),
    ])

    expect(result).toBe('timed-out')

    releaseRun?.()
    await expect(launchPromise).resolves.toBe('launch-finished')
  })
})
