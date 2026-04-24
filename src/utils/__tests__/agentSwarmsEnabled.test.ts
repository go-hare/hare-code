import { afterEach, describe, expect, test } from 'bun:test'
import { isAgentSwarmsEnabled } from '../agentSwarmsEnabled.js'

const ORIGINAL_DISABLED =
  process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS_DISABLED

afterEach(() => {
  if (ORIGINAL_DISABLED === undefined) {
    delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS_DISABLED
  } else {
    process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS_DISABLED =
      ORIGINAL_DISABLED
  }
})

describe('isAgentSwarmsEnabled', () => {
  test('defaults to enabled', () => {
    delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS_DISABLED

    expect(isAgentSwarmsEnabled()).toBe(true)
  })

  test('supports explicit disable override', () => {
    process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS_DISABLED = '1'

    expect(isAgentSwarmsEnabled()).toBe(false)
  })
})
