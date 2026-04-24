import { describe, expect, test } from 'bun:test'

import { attachPendingReplStartupMessages } from '../replStartupMessages.js'

describe('replStartupMessages', () => {
  test('appends pending startup messages when they resolve', async () => {
    let resolveMessages!: (messages: any[]) => void
    const pendingStartupMessages = new Promise<any[]>(resolve => {
      resolveMessages = resolve
    })
    let messages: any[] = []

    attachPendingReplStartupMessages({
      pendingStartupMessages,
      setMessages: updater => {
        messages = updater(messages)
      },
    })

    resolveMessages([{ type: 'system', message: { content: 'ready' } }])
    await Promise.resolve()

    expect(messages).toHaveLength(1)
    expect(messages[0]?.type).toBe('system')
  })

  test('does not append after cleanup', async () => {
    let resolveMessages!: (messages: any[]) => void
    const pendingStartupMessages = new Promise<any[]>(resolve => {
      resolveMessages = resolve
    })
    let messages: any[] = []

    const cleanup = attachPendingReplStartupMessages({
      pendingStartupMessages,
      setMessages: updater => {
        messages = updater(messages)
      },
    })

    cleanup?.()
    resolveMessages([{ type: 'system', message: { content: 'late' } }])
    await Promise.resolve()

    expect(messages).toEqual([])
  })
})
