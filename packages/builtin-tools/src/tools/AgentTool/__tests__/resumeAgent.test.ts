import { afterEach, describe, expect, mock, test } from 'bun:test'

const registerAsyncAgentMock = mock(() => ({
  agentId: 'bg-1',
  abortController: new AbortController(),
}))
const assembleToolPoolMock = mock(() => ['Read'])
const runWithAgentContextMock = mock(((_ctx: any, fn: () => unknown) =>
  fn()) as any)
const runWithCwdOverrideMock = mock(((_cwd: string, fn: () => unknown) =>
  fn()) as any)
const getAgentTranscriptMock = mock(async () => ({
  messages: [{ type: 'assistant', message: { content: [] } }],
  contentReplacements: [],
}))
const readAgentMetadataMock = mock(async () => ({
  agentType: 'general-purpose',
  description: 'resume worker',
  activeTaskExecutionContext: {
    taskListId: 'alpha-team',
    taskId: '42',
    ownedFiles: ['src/coordinator/writeGuard.ts'],
  },
}))
const runAsyncAgentLifecycleMock = mock(async (args: any) => {
  args.makeStream(() => {})
})
const runAgentMock = mock(
  ((_: any) =>
    (async function* () {
      return
    })()) as any,
)

mock.module('src/bootstrap/state.js', () => ({
  getSdkAgentProgressSummariesEnabled: () => false,
}))

mock.module('src/constants/prompts.js', () => ({
  getSystemPrompt: mock(async () => 'system prompt'),
}))

mock.module('src/coordinator/coordinatorMode.js', () => ({
  isCoordinatorMode: () => false,
}))

mock.module('src/tasks/LocalAgentTask/LocalAgentTask.js', () => ({
  registerAsyncAgent: registerAsyncAgentMock,
}))

mock.module('src/tools.js', () => ({
  assembleToolPool: assembleToolPoolMock,
}))

mock.module('src/types/ids.js', () => ({
  asAgentId: (id: string) => id,
}))

mock.module('src/utils/agentContext.js', () => ({
  runWithAgentContext: runWithAgentContextMock,
}))

mock.module('src/utils/cwd.js', () => ({
  runWithCwdOverride: runWithCwdOverrideMock,
}))

mock.module('src/utils/debug.js', () => ({
  logForDebugging: () => {},
}))

mock.module('src/utils/messages.js', () => ({
  createUserMessage: ({ content }: { content: string }) => ({
    type: 'user',
    message: { content },
  }),
  filterOrphanedThinkingOnlyMessages: (messages: any) => messages,
  filterUnresolvedToolUses: (messages: any) => messages,
  filterWhitespaceOnlyAssistantMessages: (messages: any) => messages,
}))

mock.module('src/utils/model/agent.js', () => ({
  getAgentModel: () => 'sonnet',
}))

mock.module('src/utils/promptCategory.js', () => ({
  getQuerySourceForAgent: () => 'agent:builtin:general-purpose',
}))

mock.module('src/utils/sessionStorage.js', () => ({
  getAgentTranscript: getAgentTranscriptMock,
  readAgentMetadata: readAgentMetadataMock,
}))

mock.module('src/utils/systemPrompt.js', () => ({
  buildEffectiveSystemPrompt: () => 'system prompt',
}))

mock.module('src/utils/task/diskOutput.js', () => ({
  getTaskOutputPath: (agentId: string) => `/tmp/${agentId}.out`,
}))

mock.module('src/utils/teammate.js', () => ({
  getParentSessionId: () => 'parent-session',
}))

mock.module('src/utils/toolResultStorage.js', () => ({
  reconstructForSubagentResume: () => ({ restored: true }),
}))

mock.module('../agentToolUtils.js', () => ({
  runAsyncAgentLifecycle: runAsyncAgentLifecycleMock,
}))

mock.module('../built-in/generalPurposeAgent.js', () => ({
  GENERAL_PURPOSE_AGENT: {
    agentType: 'general-purpose',
    permissionMode: 'default',
    model: 'sonnet',
  },
}))

mock.module('../forkSubagent.js', () => ({
  FORK_AGENT: {
    agentType: 'fork',
    permissionMode: 'default',
  },
  isForkSubagentEnabled: () => false,
}))

mock.module('../loadAgentsDir.js', () => ({
  isBuiltInAgent: () => true,
}))

mock.module('../runAgent.js', () => ({
  runAgent: runAgentMock,
}))

const { resumeAgentBackground } = await import('../resumeAgent.js')

describe('resumeAgentBackground', () => {
  afterEach(() => {
    registerAsyncAgentMock.mockClear()
    assembleToolPoolMock.mockClear()
    runWithAgentContextMock.mockClear()
    runWithCwdOverrideMock.mockClear()
    getAgentTranscriptMock.mockReset()
    readAgentMetadataMock.mockReset()
    runAsyncAgentLifecycleMock.mockClear()
    runAgentMock.mockClear()

    getAgentTranscriptMock.mockImplementation(async () => ({
      messages: [{ type: 'assistant', message: { content: [] } }],
      contentReplacements: [],
    }))
    readAgentMetadataMock.mockImplementation(async () => ({
      agentType: 'general-purpose',
      description: 'resume worker',
      activeTaskExecutionContext: {
        taskListId: 'alpha-team',
        taskId: '42',
        ownedFiles: ['src/coordinator/writeGuard.ts'],
      },
    }))
  })

  test('restores active task execution context and owned files on resume', async () => {
    const toolUseContext = {
      options: {
        mainLoopModel: 'sonnet',
        tools: [],
        mcpClients: [],
        agentDefinitions: {
          activeAgents: [
            {
              agentType: 'general-purpose',
              permissionMode: 'default',
              model: 'sonnet',
            },
          ],
        },
      },
      getAppState: () =>
        ({
          toolPermissionContext: {
            mode: 'default',
            additionalWorkingDirectories: new Map(),
          },
          agentDefinitions: {
            activeAgents: [
              {
                agentType: 'general-purpose',
                permissionMode: 'default',
                model: 'sonnet',
              },
            ],
          },
          mcp: { tools: [] },
        }) as any,
      setAppState: () => {},
      setAppStateForTasks: () => {},
      messages: [],
      readFileState: new Map(),
      abortController: new AbortController(),
      setInProgressToolUseIDs: () => {},
      setResponseLength: () => {},
      updateFileHistoryState: () => ({} as never),
      updateAttributionState: () => ({} as never),
      contentReplacementState: {} as any,
    } as any

    await resumeAgentBackground({
      agentId: 'agent-1',
      prompt: 'continue',
      toolUseContext,
      canUseTool: (() => true) as any,
    })

    expect(runAgentMock).toHaveBeenCalledTimes(1)
    expect(runAgentMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        ownedFiles: ['src/coordinator/writeGuard.ts'],
        activeTaskExecutionContext: {
          taskListId: 'alpha-team',
          taskId: '42',
          ownedFiles: ['src/coordinator/writeGuard.ts'],
        },
      }),
    )
  })
})
