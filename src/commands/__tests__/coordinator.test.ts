import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test'
import type {
  AgentDefinition,
  AgentDefinitionsResult,
} from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'

let isCoordinatorModeEnabled = false
let savedModes: Array<'coordinator' | 'normal'> = []
let cacheCleared = false
let loadedCwds: string[] = []
let freshAgentDefinitions: AgentDefinitionsResult = {
  activeAgents: [],
  allAgents: [],
}
const TEST_CWD = 'D:/work/py/reachy_code/claude-code'

const mockAgentDefinition = (agentType: string): AgentDefinition =>
  ({ agentType, source: 'built-in' }) as unknown as AgentDefinition

mock.module('bun:bundle', () => ({
  feature: () => true,
}))

const coordinatorMode = await import('../../coordinator/coordinatorMode.js')
const { setOriginalCwd } = await import('../../bootstrap/state.js')
const sessionStorage = await import('../../utils/sessionStorage.js')
const loadAgentsDir = await import(
  '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'
)
const isCoordinatorModeSpy = spyOn(coordinatorMode, 'isCoordinatorMode')
const saveModeSpy = spyOn(sessionStorage, 'saveMode')
const getAgentDefinitionsWithOverridesSpy = spyOn(
  loadAgentsDir,
  'getAgentDefinitionsWithOverrides',
)
const coordinatorCommand = (await import('../coordinator.js')).default

beforeEach(() => {
  setOriginalCwd(TEST_CWD)
  isCoordinatorModeSpy.mockImplementation(() => isCoordinatorModeEnabled)
  saveModeSpy.mockImplementation((mode: 'coordinator' | 'normal') => {
    savedModes.push(mode)
  })
  const getAgentDefinitionsWithOverridesMock = Object.assign(
    async (cwd: string): Promise<AgentDefinitionsResult> => {
      loadedCwds.push(cwd)
      return freshAgentDefinitions
    },
    {
      cache: {
        clear: () => {
          cacheCleared = true
        },
      },
    },
  )
  const memoizedGetAgentDefinitionsWithOverridesMock =
    getAgentDefinitionsWithOverridesMock as typeof loadAgentsDir.getAgentDefinitionsWithOverrides
  Object.assign(getAgentDefinitionsWithOverridesSpy, {
    cache: memoizedGetAgentDefinitionsWithOverridesMock.cache,
  })
  getAgentDefinitionsWithOverridesSpy.mockImplementation(
    memoizedGetAgentDefinitionsWithOverridesMock,
  )
  isCoordinatorModeEnabled = false
  savedModes = []
  cacheCleared = false
  loadedCwds = []
  freshAgentDefinitions = {
    activeAgents: [mockAgentDefinition('worker')],
    allAgents: [mockAgentDefinition('worker')],
  }
  delete process.env.CLAUDE_CODE_COORDINATOR_MODE
})

afterEach(() => {
  isCoordinatorModeSpy.mockReset()
  saveModeSpy.mockReset()
  getAgentDefinitionsWithOverridesSpy.mockReset()
})

afterAll(() => {
  isCoordinatorModeSpy.mockRestore()
  saveModeSpy.mockRestore()
  getAgentDefinitionsWithOverridesSpy.mockRestore()
})

describe('/coordinator', () => {
  test('enabling coordinator mode refreshes agent definitions to worker mode', async () => {
    const mod = await coordinatorCommand.load()
    const currentAgentDefinitions = {
      activeAgents: [{ agentType: 'general-purpose', source: 'built-in' }],
      allAgents: [
        { agentType: 'general-purpose', source: 'built-in' },
        { agentType: 'statusline-setup', source: 'built-in' },
        { agentType: 'hello-agent', source: 'flagSettings' },
      ],
      allowedAgentTypes: ['worker'],
    }
    let appState = {
      agentDefinitions: currentAgentDefinitions,
    }
    let resultText: string | undefined
    let options: Parameters<Parameters<typeof mod.call>[0]>[1] | undefined

    await mod.call(
      (result, opts) => {
        resultText = result
        options = opts
      },
      {
        getAppState: () => appState,
        setAppState: (updater: (prev: typeof appState) => typeof appState) => {
          appState = updater(appState as any) as typeof appState
        },
      } as any,
    )

    expect(process.env.CLAUDE_CODE_COORDINATOR_MODE).toBe('1')
    expect(cacheCleared).toBe(true)
    expect(loadedCwds).toEqual([TEST_CWD])
    expect(appState.agentDefinitions).toEqual({
      activeAgents: [
        { agentType: 'worker', source: 'built-in' },
        { agentType: 'hello-agent', source: 'flagSettings' },
      ],
      allAgents: [
        { agentType: 'worker', source: 'built-in' },
        { agentType: 'hello-agent', source: 'flagSettings' },
      ],
      allowedAgentTypes: ['worker'],
    })
    expect(savedModes).toEqual(['coordinator'])
    expect(resultText).toContain('Coordinator mode enabled')
    expect(options?.display).toBe('system')
  })

  test('disabling coordinator mode refreshes agent definitions back to normal mode', async () => {
    const mod = await coordinatorCommand.load()
    isCoordinatorModeEnabled = true
    freshAgentDefinitions = {
      activeAgents: [mockAgentDefinition('general-purpose')],
      allAgents: [mockAgentDefinition('general-purpose')],
    }
    process.env.CLAUDE_CODE_COORDINATOR_MODE = '1'
    let appState = {
      agentDefinitions: {
        activeAgents: [{ agentType: 'worker', source: 'built-in' }],
        allAgents: [
          { agentType: 'worker', source: 'built-in' },
          { agentType: 'hello-agent', source: 'flagSettings' },
        ],
      },
    }
    let resultText: string | undefined

    await mod.call(
      result => {
        resultText = result
      },
      {
        getAppState: () => appState,
        setAppState: (updater: (prev: typeof appState) => typeof appState) => {
          appState = updater(appState as any) as typeof appState
        },
      } as any,
    )

    expect(process.env.CLAUDE_CODE_COORDINATOR_MODE).toBeUndefined()
    expect(cacheCleared).toBe(true)
    expect(appState.agentDefinitions).toEqual({
      activeAgents: [
        { agentType: 'general-purpose', source: 'built-in' },
        { agentType: 'hello-agent', source: 'flagSettings' },
      ],
      allAgents: [
        { agentType: 'general-purpose', source: 'built-in' },
        { agentType: 'hello-agent', source: 'flagSettings' },
      ],
    })
    expect(savedModes).toEqual(['normal'])
    expect(resultText).toBe('Coordinator mode disabled — back to normal mode')
  })
})
