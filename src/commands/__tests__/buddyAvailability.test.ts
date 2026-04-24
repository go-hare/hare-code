import { afterEach, describe, expect, mock, test } from 'bun:test'

const ORIGINAL_USER_TYPE = process.env.USER_TYPE
const ORIGINAL_ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

afterEach(() => {
  if (ORIGINAL_USER_TYPE === undefined) {
    delete process.env.USER_TYPE
  } else {
    process.env.USER_TYPE = ORIGINAL_USER_TYPE
  }

  if (ORIGINAL_ANTHROPIC_API_KEY === undefined) {
    delete process.env.ANTHROPIC_API_KEY
  } else {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_ANTHROPIC_API_KEY
  }
})

describe('buddy command availability', () => {
  test('registers /buddy when runtime gate enables it for external builds', async () => {
    process.env.USER_TYPE = 'external'
    process.env.ANTHROPIC_API_KEY = 'test-key'

    mock.module('../../buddy/enabled.js', () => ({
      isBuddyEnabled: () => true,
    }))

    const { builtInCommandNames } = await import('../../commands.js')

    expect(builtInCommandNames().has('buddy')).toBe(true)
  })
})
