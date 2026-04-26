import { afterEach, describe, expect, mock, test } from 'bun:test'

mock.module('bun:bundle', () => ({ feature: () => true }))

const { setIsInteractive } = await import('../bootstrap/state.js')
const { getCoordinatorSystemPrompt } = await import('./coordinatorMode.js')

afterEach(() => {
  delete process.env.CLAUDE_CODE_ENABLE_TASKS
  setIsInteractive(true)
})

describe('getCoordinatorSystemPrompt', () => {
  test('omits task_id guidance when task tools are unavailable', () => {
    setIsInteractive(false)
    delete process.env.CLAUDE_CODE_ENABLE_TASKS

    const prompt = getCoordinatorSystemPrompt()

    expect(prompt).not.toContain('pass that task')
    expect(prompt).not.toContain('`task_id` so worker completion')
    expect(prompt).toContain('pass those paths via `owned_files`')
  })

  test('includes task_id guidance when task tools are available', () => {
    setIsInteractive(false)
    process.env.CLAUDE_CODE_ENABLE_TASKS = '1'

    const prompt = getCoordinatorSystemPrompt()

    expect(prompt).toContain(
      "pass that task's ID as `task_id` so worker completion can be linked back to the task",
    )
  })
})
