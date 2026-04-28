import { beforeEach, describe, expect, test } from 'bun:test'
import {
  getPromptId,
  resetStateForTests,
} from '../../bootstrap/state.js'
import { processTextPrompt } from '../processUserInput/processTextPrompt.js'

describe('processTextPrompt', () => {
  beforeEach(() => {
    resetStateForTests()
  })

  test('stores promptId through runtime request debug state', () => {
    expect(getPromptId()).toBeNull()

    const result = processTextPrompt('hello world', [], [], [])

    expect(result.shouldQuery).toBe(true)
    expect(getPromptId()).toEqual(expect.any(String))
  })
})
