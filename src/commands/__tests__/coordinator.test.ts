import { beforeEach, describe, expect, mock, test } from 'bun:test'

let isCoordinatorModeEnabled = false
let savedModes: Array<'coordinator' | 'normal'> = []
let cacheCleared = false
let loadedCwds: string[] = []
let freshAgentDefinitions: {
  activeAgents: Array<Record<string, unknown>>
  allAgents: Array<Record<string, unknown>>
} = {
  activeAgents: [],
  allAgents: [],
}

mock.module('bun:bundle', () => ({
  feature: () => true,
}))

mock.module('../../bootstrap/state.js', () => ({
  getOriginalCwd: () => 'D:/work/py/reachy_code/claude-code',
}))

mock.module('../../coordinator/coordinatorMode.js', () => ({
  isCoordinatorMode: () => isCoordinatorModeEnabled,
}))

mock.module('@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js', () => ({
  getActiveAgentsFromList: (allAgents: Array<Record<string, unknown>>) => allAgents,
  getAgentDefinitionsWithOverrides: Object.assign(
    async (cwd: string) => {
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
  ),
}))

mock.module('../../utils/sessionStorage.js', () => ({
  saveMode: (mode: 'coordinator' | 'normal') => {
    savedModes.push(mode)
  },
}))

const coordinatorCommand = (await import('../coordinator.js')).default

beforeEach(() => {
  isCoordinatorModeEnabled = false
  savedModes = []
  cacheCleared = false
  loadedCwds = []
  freshAgentDefinitions = {
    activeAgents: [{ agentType: 'worker', source: 'built-in' }],
    allAgents: [{ agentType: 'worker', source: 'built-in' }],
  }
  delete process.env.CLAUDE_CODE_COORDINATOR_MODE
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
    expect(loadedCwds).toEqual(['D:/work/py/reachy_code/claude-code'])
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
      activeAgents: [{ agentType: 'general-purpose', source: 'built-in' }],
      allAgents: [{ agentType: 'general-purpose', source: 'built-in' }],
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
