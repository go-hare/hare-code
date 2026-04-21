import { afterEach, describe, expect, test } from 'bun:test'
import {
  getBuddyReactionModel,
  installCompanionObserver,
  triggerCompanionReaction,
} from '../companionReact.js'

const ORIGINAL_ENV = {
  CLAUDE_CODE_USE_OPENAI: process.env.CLAUDE_CODE_USE_OPENAI,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  OPENAI_SMALL_FAST_MODEL: process.env.OPENAI_SMALL_FAST_MODEL,
  OPENAI_DEFAULT_HAIKU_MODEL: process.env.OPENAI_DEFAULT_HAIKU_MODEL,
  ANTHROPIC_DEFAULT_HAIKU_MODEL: process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL,
}

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

afterEach(() => {
  restoreEnv()
  delete (
    globalThis as typeof globalThis & {
      fireCompanionObserver?: unknown
    }
  ).fireCompanionObserver
})

describe('companionReact', () => {
  test('registers global companion observer', () => {
    installCompanionObserver()

    expect(
      (
        globalThis as typeof globalThis & {
          fireCompanionObserver?: unknown
        }
      ).fireCompanionObserver,
    ).toBe(triggerCompanionReaction)
  })

  test('uses OPENAI_MODEL for reactions when no haiku override is configured', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    process.env.OPENAI_MODEL = 'gpt-5.4'
    delete process.env.OPENAI_SMALL_FAST_MODEL
    delete process.env.OPENAI_DEFAULT_HAIKU_MODEL
    delete process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL

    expect(getBuddyReactionModel()).toBe('gpt-5.4')
  })

  test('prefers OPENAI_SMALL_FAST_MODEL when configured', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    process.env.OPENAI_MODEL = 'gpt-5.4'
    process.env.OPENAI_SMALL_FAST_MODEL = 'gpt-4.1-mini'

    expect(getBuddyReactionModel()).toBe('gpt-4.1-mini')
  })
})
