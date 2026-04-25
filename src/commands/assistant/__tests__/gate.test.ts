import { beforeEach, describe, expect, mock, test } from 'bun:test'

let sharedKairosGateEnabled = false

mock.module('../../../assistant/gate.js', () => ({
  isKairosEnabledCachedOrEnv: () => sharedKairosGateEnabled,
}))

const { isAssistantCommandEnabled, isAssistantEnabled } = await import(
  '../gate.js'
)

beforeEach(() => {
  sharedKairosGateEnabled = false
})

describe('assistant command gate', () => {
  test('delegates enabled state to the shared KAIROS gate', () => {
    sharedKairosGateEnabled = true

    expect(isAssistantEnabled()).toBe(true)
    expect(isAssistantCommandEnabled()).toBe(true)
  })

  test('delegates disabled state to the shared KAIROS gate', () => {
    expect(isAssistantEnabled()).toBe(false)
    expect(isAssistantCommandEnabled()).toBe(false)
  })
})
