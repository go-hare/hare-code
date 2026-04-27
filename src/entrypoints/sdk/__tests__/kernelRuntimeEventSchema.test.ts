import { describe, expect, test } from 'bun:test'

import { StdoutMessageSchema } from '../controlSchemas.js'

describe('kernel runtime event stdout schema', () => {
  test('accepts runtime envelope messages on the SDK stdout stream', () => {
    const message = {
      type: 'kernel_runtime_event',
      uuid: 'message-1',
      session_id: 'session-1',
      envelope: {
        schemaVersion: 'kernel.runtime.v1',
        messageId: 'message-1',
        sequence: 1,
        timestamp: '2026-04-26T00:00:00.000Z',
        source: 'kernel_runtime',
        kind: 'event',
        runtimeId: 'runtime-1',
        conversationId: 'conversation-1',
        eventId: 'conversation-1:1',
        payload: {
          type: 'permission.requested',
          replayable: true,
        },
      },
    } as const

    expect(StdoutMessageSchema().parse(message)).toEqual(message)
  })
})
