import { afterEach, describe, expect, test } from 'bun:test'

const {
  checkGate_CACHED_OR_BLOCKING,
  getFeatureValue_CACHED_MAY_BE_STALE,
  resetGrowthBook,
} = await import('../growthbook.js')

const ORIGINAL_ENV = {
  USER_TYPE: process.env.USER_TYPE,
  CLAUDE_INTERNAL_FC_OVERRIDES: process.env.CLAUDE_INTERNAL_FC_OVERRIDES,
  CLAUDE_CODE_DISABLE_LOCAL_GATES: process.env.CLAUDE_CODE_DISABLE_LOCAL_GATES,
  CLAUDE_GB_ADAPTER_URL: process.env.CLAUDE_GB_ADAPTER_URL,
  CLAUDE_GB_ADAPTER_KEY: process.env.CLAUDE_GB_ADAPTER_KEY,
  CLAUDE_CODE_ENABLE_ANTHROPIC_EVENT_LOGGING:
    process.env.CLAUDE_CODE_ENABLE_ANTHROPIC_EVENT_LOGGING,
}

function restoreEnv(): void {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

function resetToLocalGateBaseline(): void {
  delete process.env.USER_TYPE
  delete process.env.CLAUDE_INTERNAL_FC_OVERRIDES
  delete process.env.CLAUDE_CODE_DISABLE_LOCAL_GATES
  delete process.env.CLAUDE_GB_ADAPTER_URL
  delete process.env.CLAUDE_GB_ADAPTER_KEY
  delete process.env.CLAUDE_CODE_ENABLE_ANTHROPIC_EVENT_LOGGING
}

afterEach(() => {
  restoreEnv()
  resetGrowthBook()
})

describe('GrowthBook local gate defaults', () => {
  test('keeps the current KAIROS gate enabled for cached and blocking reads', async () => {
    resetToLocalGateBaseline()

    expect(getFeatureValue_CACHED_MAY_BE_STALE('tengu_kairos', false)).toBe(
      true,
    )
    expect(await checkGate_CACHED_OR_BLOCKING('tengu_kairos')).toBe(true)
  })

  test('keeps the legacy KAIROS gate key enabled for compatibility', () => {
    resetToLocalGateBaseline()

    expect(
      getFeatureValue_CACHED_MAY_BE_STALE('tengu_kairos_assistant', false),
    ).toBe(true)
  })
})
