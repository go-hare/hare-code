import { describe, expect, mock, test } from 'bun:test'
import { forwardMessagesToBridge } from '../headlessBridgeForwarding.js'

describe('forwardMessagesToBridge', () => {
  test('forwards only new user and assistant messages', () => {
    const writeMessages = mock((_messages: unknown[]) => {})
    const nextIndex = forwardMessagesToBridge({
      bridgeHandle: {
        writeMessages,
      } as never,
      bridgeLastForwardedIndex: 1,
      mutableMessages: [
        { type: 'system', text: 'ignore' },
        { type: 'user', message: { content: 'hi' } },
        { type: 'assistant', message: { content: 'hello' } },
        { type: 'result', duration_ms: 1 },
      ] as never,
    })

    expect(nextIndex).toBe(4)
    expect(writeMessages).toHaveBeenCalledTimes(1)
    expect(writeMessages.mock.calls[0]?.[0]).toEqual([
      { type: 'user', message: { content: 'hi' } },
      { type: 'assistant', message: { content: 'hello' } },
    ])
  })

  test('keeps cursor unchanged when bridge is disabled', () => {
    const nextIndex = forwardMessagesToBridge({
      bridgeHandle: null,
      bridgeLastForwardedIndex: 3,
      mutableMessages: [] as never,
    })

    expect(nextIndex).toBe(3)
  })
})
