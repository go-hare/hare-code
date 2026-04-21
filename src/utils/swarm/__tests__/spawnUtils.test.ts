import { afterEach, describe, expect, test } from 'bun:test'
import { buildInheritedEnvVars } from '../spawnUtils.js'

const ENV_KEYS = [
  'CLAUDE_CODE_USE_OPENAI',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_MODEL',
  'CLAUDE_CODE_USE_GEMINI',
  'GEMINI_API_KEY',
  'GEMINI_BASE_URL',
  'GEMINI_MODEL',
  'CLAUDE_CODE_USE_GROK',
  'GROK_API_KEY',
  'XAI_API_KEY',
  'GROK_BASE_URL',
  'GROK_MODEL',
  'GROK_MODEL_MAP',
] as const

const ORIGINAL_ENV = Object.fromEntries(
  ENV_KEYS.map(key => [key, process.env[key]]),
) as Record<(typeof ENV_KEYS)[number], string | undefined>

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

describe('buildInheritedEnvVars', () => {
  test('forwards env-driven OpenAI provider context to teammate processes', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    process.env.OPENAI_API_KEY = 'sk-test'
    process.env.OPENAI_BASE_URL = 'http://127.0.0.1:8317/v1'
    process.env.OPENAI_MODEL = 'gpt-5.4'

    const env = buildInheritedEnvVars()

    expect(env).toContain('CLAUDE_CODE_USE_OPENAI=1')
    expect(env).toContain('OPENAI_API_KEY=sk-test')
    expect(env).toContain('OPENAI_BASE_URL=http\\://127.0.0.1\\:8317/v1')
    expect(env).toContain('OPENAI_MODEL=gpt-5.4')
  })

  test('forwards Gemini and Grok provider context to teammate processes', () => {
    process.env.CLAUDE_CODE_USE_GEMINI = '1'
    process.env.GEMINI_API_KEY = 'gemini-key'
    process.env.GEMINI_BASE_URL = 'https://gemini.example/v1'
    process.env.GEMINI_MODEL = 'gemini-2.5-pro'
    process.env.CLAUDE_CODE_USE_GROK = '1'
    process.env.GROK_API_KEY = 'grok-key'
    process.env.XAI_API_KEY = 'xai-key'
    process.env.GROK_BASE_URL = 'https://api.x.ai/v1'
    process.env.GROK_MODEL = 'grok-4'
    process.env.GROK_MODEL_MAP = '{"haiku":"grok-4-fast"}'

    const env = buildInheritedEnvVars()

    expect(env).toContain('CLAUDE_CODE_USE_GEMINI=1')
    expect(env).toContain('GEMINI_API_KEY=gemini-key')
    expect(env).toContain('GEMINI_BASE_URL=https\\://gemini.example/v1')
    expect(env).toContain('GEMINI_MODEL=gemini-2.5-pro')
    expect(env).toContain('CLAUDE_CODE_USE_GROK=1')
    expect(env).toContain('GROK_API_KEY=grok-key')
    expect(env).toContain('XAI_API_KEY=xai-key')
    expect(env).toContain('GROK_BASE_URL=https\\://api.x.ai/v1')
    expect(env).toContain('GROK_MODEL=grok-4')
    expect(env).toContain("GROK_MODEL_MAP='{\"haiku\":\"grok-4-fast\"}'")
  })
})
