import { afterAll, afterEach, describe, expect, mock, test } from 'bun:test'

let isCoordinatorModeEnabled = false

mock.module('bun:bundle', () => ({
  feature: () => false,
}))

mock.module('src/coordinator/coordinatorMode.js', () => ({
  getWorkerAntiInjectionAddendum: () => '\nworker anti-injection',
  isCoordinatorMode: () => isCoordinatorModeEnabled,
}))

const { setIsInteractive } = await import('src/bootstrap/state.js')
const { inputSchema } = await import('../AgentTool.js')

const agentInput = {
  description: 'Read package name',
  prompt: 'Read package.json and report the package name.',
  subagent_type: 'worker',
  name: 'package-reader',
  team_name: 'default',
  mode: 'plan',
  task_id: 'task-1',
  owned_files: ['src/example.ts'],
}

afterEach(() => {
  isCoordinatorModeEnabled = false
  delete process.env.CLAUDE_CODE_COORDINATOR_MODE
  delete process.env.CLAUDE_CODE_ENABLE_TASKS
  setIsInteractive(true)
})

afterAll(() => {
  mock.restore()
})

describe('AgentTool inputSchema', () => {
  test('hides team-routing fields when coordinator mode is enabled after a prior schema read', () => {
    setIsInteractive(false)
    process.env.CLAUDE_CODE_ENABLE_TASKS = '1'

    const normalInput = inputSchema().parse(agentInput) as Record<
      string,
      unknown
    >

    expect(normalInput.name).toBe('package-reader')
    expect(normalInput.team_name).toBe('default')
    expect(normalInput.mode).toBe('plan')

    isCoordinatorModeEnabled = true
    process.env.CLAUDE_CODE_COORDINATOR_MODE = '1'

    const coordinatorInput = inputSchema().parse(agentInput) as Record<
      string,
      unknown
    >

    expect(coordinatorInput.name).toBeUndefined()
    expect(coordinatorInput.team_name).toBeUndefined()
    expect(coordinatorInput.mode).toBeUndefined()
    expect(coordinatorInput.task_id).toBe('task-1')
    expect(coordinatorInput.owned_files).toEqual(['src/example.ts'])
  })
})
