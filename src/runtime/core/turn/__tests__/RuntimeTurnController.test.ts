import { describe, expect, test } from 'bun:test'

import {
  RuntimeTurnController,
  RuntimeTurnStateError,
} from '../RuntimeTurnController.js'

function createClock(): () => string {
  let tick = 0
  return () => `2026-04-26T00:00:0${tick++}.000Z`
}

describe('RuntimeTurnController', () => {
  test('runs a turn through start and complete', () => {
    const turn = new RuntimeTurnController({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      now: createClock(),
    })

    expect(turn.snapshot()).toEqual({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      state: 'idle',
      startedAt: undefined,
      completedAt: undefined,
      stopReason: undefined,
      error: undefined,
    })

    expect(turn.start()).toMatchObject({
      state: 'running',
      startedAt: '2026-04-26T00:00:00.000Z',
    })
    expect(turn.isActive).toBe(true)

    expect(turn.complete('end_turn')).toMatchObject({
      state: 'completed',
      completedAt: '2026-04-26T00:00:01.000Z',
      stopReason: 'end_turn',
    })
    expect(turn.isActive).toBe(false)
  })

  test('keeps abort idempotent while a turn is aborting', () => {
    const turn = new RuntimeTurnController({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      now: createClock(),
    })

    turn.start()
    const firstAbort = turn.requestAbort('user_interrupt')
    const duplicateAbort = turn.requestAbort('different_reason')

    expect(firstAbort).toMatchObject({
      state: 'aborting',
      stopReason: 'user_interrupt',
    })
    expect(duplicateAbort).toEqual(firstAbort)

    expect(turn.complete()).toMatchObject({
      state: 'completed',
      stopReason: 'user_interrupt',
    })
  })

  test('does not mutate a completed turn on abort-after-complete', () => {
    const turn = new RuntimeTurnController({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      now: createClock(),
    })

    turn.start()
    const completed = turn.complete('end_turn')

    expect(turn.requestAbort('late_abort')).toEqual(completed)
  })

  test('rejects invalid lifecycle transitions', () => {
    const turn = new RuntimeTurnController({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
    })

    expect(() => turn.complete()).toThrow(RuntimeTurnStateError)
    turn.start()
    expect(() => turn.start()).toThrow(RuntimeTurnStateError)
  })

  test('hydrates an active turn snapshot for recovery', () => {
    const turn = new RuntimeTurnController({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      initialSnapshot: {
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        state: 'running',
        startedAt: '2026-04-26T00:00:00.000Z',
      },
      now: createClock(),
    })

    expect(turn.isActive).toBe(true)
    expect(turn.snapshot()).toMatchObject({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      state: 'running',
      startedAt: '2026-04-26T00:00:00.000Z',
    })
    expect(turn.requestAbort('recovered_abort')).toMatchObject({
      state: 'aborting',
      stopReason: 'recovered_abort',
    })
  })
})
