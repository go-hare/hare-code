import { afterEach, describe, expect, mock, test } from 'bun:test'

mock.module('bun:bundle', () => ({
  feature: () => false,
}))

mock.module('../../../../coordinator/coordinatorMode.js', () => ({
  isCoordinatorMode: () =>
    process.env.CLAUDE_CODE_COORDINATOR_MODE === '1',
  getWorkerAntiInjectionAddendum: () => '',
  getCoordinatorUserContext: () => ({}),
  matchSessionMode: () => undefined,
  getCoordinatorSystemPrompt: () => '',
}))

const { setIsInteractive } = await import('../../../../bootstrap/state.js')
const { getEmptyToolPermissionContext } = await import('../../../../Tool.js')
const { addCoordinatorSimpleModeTools } = await import('../ToolCatalog.js')
const { getTools } = await import('../ToolPolicy.js')

const envKeys = [
  'CLAUDE_CODE_SIMPLE',
  'CLAUDE_CODE_COORDINATOR_MODE',
  'CLAUDE_CODE_ENABLE_TASKS',
] as const
const savedEnv = new Map(envKeys.map(key => [key, process.env[key]]))

afterEach(() => {
  for (const key of envKeys) {
    const value = savedEnv.get(key)
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
  setIsInteractive(true)
})

function getCoordinatorSimpleToolNames(includeAgent = true): string[] {
  const tools: Parameters<typeof addCoordinatorSimpleModeTools>[0] = []
  addCoordinatorSimpleModeTools(tools, { includeAgent })
  return tools.map(tool => tool.name)
}

describe('addCoordinatorSimpleModeTools', () => {
  test('adds task lifecycle tools in simple coordinator mode when tasks are enabled', () => {
    setIsInteractive(false)
    process.env.CLAUDE_CODE_ENABLE_TASKS = '1'

    expect(getCoordinatorSimpleToolNames()).toEqual(
      expect.arrayContaining([
        'Agent',
        'TaskStop',
        'SendMessage',
        'TaskCreate',
        'TaskGet',
        'TaskList',
        'TaskUpdate',
      ]),
    )
  })

  test('does not add task lifecycle tools in simple coordinator mode when tasks are disabled', () => {
    setIsInteractive(false)
    delete process.env.CLAUDE_CODE_ENABLE_TASKS

    expect(getCoordinatorSimpleToolNames()).not.toEqual(
      expect.arrayContaining([
        'TaskCreate',
        'TaskGet',
        'TaskList',
        'TaskUpdate',
      ]),
    )
  })

  test('wires task lifecycle tools through getTools when coordinator feature is enabled', () => {
    setIsInteractive(false)
    process.env.CLAUDE_CODE_SIMPLE = '1'
    process.env.CLAUDE_CODE_COORDINATOR_MODE = '1'
    process.env.CLAUDE_CODE_ENABLE_TASKS = '1'

    expect(
      getTools(getEmptyToolPermissionContext()).map(tool => tool.name),
    ).toEqual(
      expect.arrayContaining([
        'Agent',
        'TaskStop',
        'SendMessage',
        'TaskCreate',
        'TaskGet',
        'TaskList',
        'TaskUpdate',
      ]),
    )
  })
})
