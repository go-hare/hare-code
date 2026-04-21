import { afterEach, describe, expect, test } from 'bun:test'
import { getAgentModel } from '../agent.js'

const ORIGINAL_ENV = {
  CLAUDE_CODE_USE_OPENAI: process.env.CLAUDE_CODE_USE_OPENAI,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  OPENAI_DEFAULT_HAIKU_MODEL: process.env.OPENAI_DEFAULT_HAIKU_MODEL,
  OPENAI_DEFAULT_SONNET_MODEL: process.env.OPENAI_DEFAULT_SONNET_MODEL,
  OPENAI_DEFAULT_OPUS_MODEL: process.env.OPENAI_DEFAULT_OPUS_MODEL,
  ANTHROPIC_DEFAULT_HAIKU_MODEL: process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL,
  ANTHROPIC_DEFAULT_SONNET_MODEL: process.env.ANTHROPIC_DEFAULT_SONNET_MODEL,
  ANTHROPIC_DEFAULT_OPUS_MODEL: process.env.ANTHROPIC_DEFAULT_OPUS_MODEL,
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
})

describe('getAgentModel', () => {
  test('inherits parent model for OpenAI haiku when no family override is configured', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    delete process.env.OPENAI_MODEL
    delete process.env.OPENAI_DEFAULT_HAIKU_MODEL
    delete process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL

    expect(getAgentModel(undefined, 'gpt-5.4', 'haiku')).toBe('gpt-5.4')
  })

  test('inherits parent model for OpenAI sonnet alias when no family override is configured', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    delete process.env.OPENAI_MODEL
    delete process.env.OPENAI_DEFAULT_SONNET_MODEL
    delete process.env.ANTHROPIC_DEFAULT_SONNET_MODEL

    expect(getAgentModel('sonnet', 'gpt-5.4')).toBe('gpt-5.4')
  })

  test('inherits parent model for OpenAI haiku when OPENAI_MODEL is set but no family override exists', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    process.env.OPENAI_MODEL = 'gpt-5.4'
    delete process.env.OPENAI_DEFAULT_HAIKU_MODEL
    delete process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL

    expect(getAgentModel(undefined, 'gpt-5.4', 'haiku')).toBe('gpt-5.4')
  })

  test('inherits parent model for OpenAI sonnet alias when OPENAI_MODEL is set but no family override exists', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    process.env.OPENAI_MODEL = 'gpt-5.4'
    delete process.env.OPENAI_DEFAULT_SONNET_MODEL
    delete process.env.ANTHROPIC_DEFAULT_SONNET_MODEL

    expect(getAgentModel('sonnet', 'gpt-5.4')).toBe('gpt-5.4')
  })

  test('uses explicit OpenAI haiku override when configured', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    process.env.OPENAI_DEFAULT_HAIKU_MODEL = 'custom-haiku-model'

    expect(getAgentModel(undefined, 'gpt-5.4', 'haiku')).toBe(
      'custom-haiku-model',
    )
  })
})
