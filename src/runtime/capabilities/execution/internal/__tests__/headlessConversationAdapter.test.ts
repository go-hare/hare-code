import { describe, expect, test } from 'bun:test'

import {
  createHeadlessConversation,
  createHeadlessConversationAdapter,
} from '../headlessConversationAdapter.js'

function createAdapter() {
  const envelopes: unknown[] = []
  const adapter = createHeadlessConversationAdapter({
    runtimeId: 'runtime-1',
    conversationId: 'conversation-1',
    workspacePath: '/tmp/workspace',
    sessionId: 'session-1',
    runtimeEventSink: envelope => {
      envelopes.push(envelope)
    },
  })
  return { adapter, envelopes }
}

describe('HeadlessConversationAdapter', () => {
  test('emits conversation and turn lifecycle envelopes', async () => {
    const { adapter, envelopes } = createAdapter()

    adapter.startTurn({
      turnId: 'turn-1',
      prompt: 'hello',
    })
    adapter.completeTurn('turn-1', 'end_turn')
    await adapter.dispose()

    expect(envelopes).toMatchObject([
      {
        kind: 'event',
        conversationId: 'conversation-1',
        eventId: 'conversation-1:1',
        payload: { type: 'conversation.ready' },
      },
      {
        kind: 'event',
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        eventId: 'conversation-1:2',
        payload: {
          type: 'turn.started',
          payload: {
            conversationId: 'conversation-1',
            turnId: 'turn-1',
            state: 'running',
          },
        },
      },
      {
        kind: 'event',
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        eventId: 'conversation-1:3',
        payload: {
          type: 'turn.completed',
          payload: {
            conversationId: 'conversation-1',
            turnId: 'turn-1',
            state: 'completed',
            stopReason: 'end_turn',
          },
        },
      },
      {
        kind: 'event',
        conversationId: 'conversation-1',
        eventId: 'conversation-1:4',
        payload: { type: 'conversation.disposed' },
      },
    ])
  })

  test('records abort request before terminal turn completion', () => {
    const { adapter, envelopes } = createAdapter()

    adapter.startTurn({
      turnId: 'turn-1',
      prompt: 'hello',
    })
    adapter.abortTurn('turn-1', 'interrupt')
    adapter.completeTurn('turn-1')

    expect(envelopes).toMatchObject([
      {},
      {},
      {
        payload: {
          type: 'turn.abort_requested',
          payload: {
            state: 'aborting',
            stopReason: 'interrupt',
          },
        },
      },
      {
        payload: {
          type: 'turn.completed',
          payload: {
            state: 'completed',
            stopReason: 'interrupt',
          },
        },
      },
    ])
  })

  test('createHeadlessConversation exposes a stable run/abort object API', () => {
    const envelopes: unknown[] = []
    const conversation = createHeadlessConversation({
      runtimeId: 'runtime-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
      runtimeEventSink: envelope => envelopes.push(envelope),
    })

    conversation.runTurn({
      turnId: 'turn-1',
      prompt: 'hello',
    })
    conversation.abortActiveTurn('interrupt')
    conversation.abortActiveTurn('duplicate_interrupt')
    conversation.completeTurn('turn-1')

    expect(conversation.activeTurnId).toBeUndefined()
    expect(
      envelopes.filter(
        envelope =>
          (envelope as { payload?: { type?: string } }).payload?.type ===
          'turn.abort_requested',
      ),
    ).toHaveLength(1)
    expect(envelopes).toMatchObject([
      {},
      { payload: { type: 'turn.started' } },
      {
        payload: {
          type: 'turn.abort_requested',
          payload: {
            state: 'aborting',
            stopReason: 'interrupt',
          },
        },
      },
      {
        payload: {
          type: 'turn.completed',
          payload: {
            state: 'completed',
            stopReason: 'interrupt',
          },
        },
      },
    ])
  })

  test('sanitizes failed turn errors for runtime event payloads', () => {
    const { adapter, envelopes } = createAdapter()

    adapter.startTurn({
      turnId: 'turn-1',
      prompt: 'hello',
    })
    adapter.failTurn('turn-1', new Error('boom'))

    expect(envelopes.at(-1)).toMatchObject({
      payload: {
        type: 'turn.failed',
        payload: {
          state: 'failed',
          error: {
            name: 'Error',
            message: 'boom',
          },
        },
      },
    })
    expect(JSON.parse(JSON.stringify(envelopes.at(-1)))).toEqual(
      envelopes.at(-1),
    )
  })

  test('emits recovered conversation event for hydrated active turns', () => {
    const envelopes: unknown[] = []
    const adapter = createHeadlessConversationAdapter({
      runtimeId: 'runtime-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
      sessionId: 'session-1',
      initialSnapshot: {
        runtimeId: 'runtime-1',
        conversationId: 'conversation-1',
        workspacePath: '/tmp/workspace',
        sessionId: 'session-1',
        state: 'detached',
        activeTurnId: 'turn-1',
        createdAt: '2026-04-26T00:00:00.000Z',
        updatedAt: '2026-04-26T00:00:01.000Z',
      },
      initialActiveTurnSnapshot: {
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        state: 'running',
        startedAt: '2026-04-26T00:00:00.500Z',
      },
      runtimeEventSink: envelope => envelopes.push(envelope),
    })

    expect(adapter.activeTurnId).toBe('turn-1')
    expect(envelopes).toMatchObject([
      {
        kind: 'event',
        conversationId: 'conversation-1',
        payload: {
          type: 'conversation.recovered',
          payload: {
            state: 'detached',
            activeTurnId: 'turn-1',
          },
        },
      },
    ])
    expect(adapter.abortActiveTurn('after_recovery')).toMatchObject({
      state: 'aborting',
      stopReason: 'after_recovery',
    })
  })
})
