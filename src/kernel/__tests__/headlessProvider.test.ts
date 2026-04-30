import { describe, expect, test } from 'bun:test'

import { createKernelHeadlessProviderEnv } from '../headlessProvider.js'

describe('createKernelHeadlessProviderEnv', () => {
  test('builds provider env and run options for OpenAI hosts', () => {
    const result = createKernelHeadlessProviderEnv({
      provider: 'openai',
      apiKey: 'sk-test',
      baseUrl: 'https://openai.example/v1',
      model: 'gpt-5.5',
      fallbackModel: 'gpt-5.4-mini',
      extraEnv: {
        KEEP_ME: '1',
        OMIT_ME: undefined,
      },
    })

    expect(result).toEqual({
      env: {
        CLAUDE_CODE_USE_OPENAI: '1',
        KEEP_ME: '1',
        OPENAI_API_KEY: 'sk-test',
        OPENAI_BASE_URL: 'https://openai.example/v1',
        OPENAI_MODEL: 'gpt-5.5',
      },
      runOptions: {
        userSpecifiedModel: 'gpt-5.5',
        fallbackModel: 'gpt-5.4-mini',
      },
    })
  })

  test('uses provider-specific Anthropic base url envs for infrastructure providers', () => {
    expect(
      createKernelHeadlessProviderEnv({
        provider: 'foundry',
        baseUrl: 'https://foundry.example',
      }).env,
    ).toEqual({
      CLAUDE_CODE_USE_FOUNDRY: '1',
      ANTHROPIC_FOUNDRY_BASE_URL: 'https://foundry.example',
    })
  })
})
