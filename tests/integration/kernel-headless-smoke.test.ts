import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

const mockRunHeadlessRuntime = mock(async () => {})

const {
  createDefaultKernelHeadlessEnvironment,
  createKernelHeadlessSession,
  runKernelHeadless,
} = await import('../../src/kernel/headless.js')

const savedAuthEnv = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN,
  CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR:
    process.env.CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR,
}

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key'
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR
})

afterEach(() => {
  mock.restore()
  for (const [key, value] of Object.entries(savedAuthEnv)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
})

describe('kernel headless smoke', () => {
  test('supports creating a default environment and running a session from the kernel surface', async () => {
    const environment = createDefaultKernelHeadlessEnvironment({
      commands: [
        {
          name: 'prompt-ok',
          type: 'prompt',
          disableNonInteractive: false,
        },
        {
          name: 'prompt-skip',
          type: 'prompt',
          disableNonInteractive: true,
        },
        {
          name: 'local-ok',
          type: 'local',
          supportsNonInteractive: true,
        },
      ] as never,
      tools: [{ name: 'Bash' }] as never,
      sdkMcpConfigs: { local: { type: 'sdk', name: 'local' } } as never,
      agents: [{ agentType: 'default', source: 'builtin' }] as never,
      mcpClients: [{ name: 'project', type: 'pending' }] as never,
      mcpCommands: [{ name: 'mcp-cmd' }] as never,
      mcpTools: [{ name: 'mcp-tool' }] as never,
      toolPermissionContext: { mode: 'default' } as never,
      advisorModel: 'advisor',
      kairosEnabled: true,
    })

    expect(environment.commands.map(command => command.name)).toEqual([
      'prompt-ok',
      'local-ok',
    ])
    expect(environment.store.getState().mcp.clients).toEqual([
      { name: 'project', type: 'pending' },
    ])
    expect(environment.store.getState().mcp.commands).toEqual([
      { name: 'mcp-cmd' },
    ])
    expect(environment.store.getState().mcp.tools).toEqual([
      { name: 'mcp-tool' },
    ])
    expect(environment.store.getState().agentDefinitions).toEqual({
      allAgents: [{ agentType: 'default', source: 'builtin' }],
      activeAgents: [{ agentType: 'default', source: 'builtin' }],
    })

    const deps = {
      runHeadlessRuntime: mockRunHeadlessRuntime as typeof mockRunHeadlessRuntime,
    }

    const session = createKernelHeadlessSession(environment, deps)
    await session.run('hello from kernel', {
      continue: false,
      resume: undefined,
      resumeSessionAt: undefined,
      verbose: false,
      outputFormat: undefined,
      jsonSchema: undefined,
      permissionPromptToolName: undefined,
      allowedTools: undefined,
      thinkingConfig: undefined,
      maxTurns: undefined,
      maxBudgetUsd: undefined,
      taskBudget: undefined,
      systemPrompt: undefined,
      appendSystemPrompt: undefined,
      userSpecifiedModel: undefined,
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
    })

    expect(mockRunHeadlessRuntime).toHaveBeenCalledTimes(1)
    expect(mockRunHeadlessRuntime.mock.calls[0]?.[0]).toBe('hello from kernel')
    expect(mockRunHeadlessRuntime.mock.calls[0]?.[3]).toEqual(environment.commands)
    expect(session.getState()).toBe(environment.store.getState())

    await runKernelHeadless(
      'second run',
      environment,
      {
        continue: false,
        resume: undefined,
        resumeSessionAt: undefined,
        verbose: false,
        outputFormat: undefined,
        jsonSchema: undefined,
        permissionPromptToolName: undefined,
        allowedTools: undefined,
        thinkingConfig: undefined,
        maxTurns: undefined,
        maxBudgetUsd: undefined,
        taskBudget: undefined,
        systemPrompt: undefined,
        appendSystemPrompt: undefined,
        userSpecifiedModel: undefined,
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
      },
      deps,
    )

    expect(mockRunHeadlessRuntime).toHaveBeenCalledTimes(2)
  })
})
