import { describe, expect, mock, test } from 'bun:test'

import type { SDKMessage } from '../../entrypoints/agentSdkTypes.js'
import type {
  KernelEvent,
  KernelRuntimeEnvelopeBase,
} from '../../runtime/contracts/events.js'
import {
  getSDKMessageFromKernelRuntimeEnvelope,
  getTextOutputDeltaFromKernelRuntimeEnvelope,
  handleKernelRuntimeHostEvent,
  isKernelTurnTerminalEvent,
  KernelRuntimeOutputDeltaDedupe,
  KernelRuntimeSDKMessageDedupe,
} from '../kernelRuntimeHostEvents.js'

function createEnvelope(
  event: KernelEvent,
): KernelRuntimeEnvelopeBase<KernelEvent> {
  return {
    schemaVersion: 'kernel.runtime.v1',
    messageId: `message-${event.type}`,
    sequence: 1,
    timestamp: '2026-04-27T00:00:00.000Z',
    source: 'kernel_runtime',
    kind: 'event',
    runtimeId: 'runtime-1',
    conversationId: 'conversation-1',
    turnId: 'turn-1',
    eventId: `event-${event.type}`,
    payload: event,
  }
}

function createEvent(type: string, payload?: unknown): KernelEvent {
  return {
    runtimeId: 'runtime-1',
    conversationId: 'conversation-1',
    turnId: 'turn-1',
    eventId: `event-${type}`,
    type,
    replayable: true,
    payload,
  }
}

describe('kernel runtime host events', () => {
  test('routes runtime envelopes through host callbacks', () => {
    const envelope = createEnvelope(createEvent('turn.started'))
    const onRuntimeEvent = mock((_envelope: KernelRuntimeEnvelopeBase) => {})
    const onRuntimeHeartbeat = mock(
      (_envelope: KernelRuntimeEnvelopeBase, _event: KernelEvent) => {},
    )
    const onTurnTerminal = mock(
      (_envelope: KernelRuntimeEnvelopeBase, _event: KernelEvent) => {},
    )

    handleKernelRuntimeHostEvent(envelope, {
      onRuntimeEvent,
      onRuntimeHeartbeat,
      onTurnTerminal,
    })

    expect(onRuntimeEvent).toHaveBeenCalledWith(envelope)
    expect(onRuntimeHeartbeat).toHaveBeenCalledWith(envelope, envelope.payload)
    expect(onTurnTerminal).not.toHaveBeenCalled()
  })

  test('classifies turn completed and failed as terminal host signals', () => {
    expect(isKernelTurnTerminalEvent(createEvent('turn.completed'))).toBe(true)
    expect(isKernelTurnTerminalEvent(createEvent('turn.failed'))).toBe(true)
    expect(isKernelTurnTerminalEvent(createEvent('turn.started'))).toBe(false)
    expect(isKernelTurnTerminalEvent(createEvent('headless.sdk_message'))).toBe(
      false,
    )
  })

  test('extracts SDK payloads from headless.sdk_message envelopes', () => {
    const sdkMessage: SDKMessage = {
      type: 'result',
      subtype: 'success',
      uuid: 'sdk-message-1',
    }
    const envelope = createEnvelope(
      createEvent('headless.sdk_message', sdkMessage),
    )

    expect(getSDKMessageFromKernelRuntimeEnvelope(envelope)).toBe(sdkMessage)
    expect(
      getSDKMessageFromKernelRuntimeEnvelope(
        createEnvelope(createEvent('turn.completed')),
      ),
    ).toBeUndefined()
  })

  test('routes headless.sdk_message payloads to host SDK consumers', () => {
    const sdkMessage: SDKMessage = {
      type: 'assistant',
      uuid: 'sdk-message-1',
    }
    const envelope = createEnvelope(
      createEvent('headless.sdk_message', sdkMessage),
    )
    const onSDKMessage = mock(
      (
        _message: SDKMessage,
        _envelope: KernelRuntimeEnvelopeBase,
        _event: KernelEvent,
      ) => {},
    )

    handleKernelRuntimeHostEvent(envelope, { onSDKMessage })

    expect(onSDKMessage).toHaveBeenCalledWith(
      sdkMessage,
      envelope,
      envelope.payload,
    )
  })

  test('extracts semantic text output deltas without re-rendering SDK-backed deltas', () => {
    const semanticEnvelope = createEnvelope(
      createEvent('turn.output_delta', { text: 'hello' }),
    )
    const sdkBackedEnvelope = createEnvelope(
      createEvent('turn.output_delta', {
        text: 'duplicate',
        message: { type: 'result' },
      }),
    )

    expect(getTextOutputDeltaFromKernelRuntimeEnvelope(semanticEnvelope)).toEqual(
      { text: 'hello' },
    )
    expect(
      getTextOutputDeltaFromKernelRuntimeEnvelope(sdkBackedEnvelope),
    ).toBeUndefined()
    expect(
      getTextOutputDeltaFromKernelRuntimeEnvelope(
        createEnvelope(createEvent('turn.completed')),
      ),
    ).toBeUndefined()
  })

  test('routes semantic output deltas to host consumers', () => {
    const envelope = createEnvelope(
      createEvent('turn.output_delta', { text: 'runtime text' }),
    )
    const onOutputDelta = mock(
      (
        _delta: { text: string },
        _envelope: KernelRuntimeEnvelopeBase,
        _event: KernelEvent,
      ) => {},
    )

    handleKernelRuntimeHostEvent(envelope, { onOutputDelta })

    expect(onOutputDelta).toHaveBeenCalledWith(
      { text: 'runtime text' },
      envelope,
      envelope.payload,
    )
  })

  test('dedupes SDK messages by stable uuid while allowing unkeyed deltas', () => {
    const dedupe = new KernelRuntimeSDKMessageDedupe(2)
    const first: SDKMessage = { type: 'assistant', uuid: 'message-1' }
    const second: SDKMessage = { type: 'assistant', uuid: 'message-2' }
    const third: SDKMessage = { type: 'assistant', uuid: 'message-3' }

    expect(dedupe.shouldProcess(first)).toBe(true)
    expect(dedupe.shouldProcess(first)).toBe(false)
    expect(dedupe.shouldProcess({ type: 'stream_event' })).toBe(true)
    expect(dedupe.shouldProcess({ type: 'stream_event' })).toBe(true)
    expect(dedupe.shouldProcess(second)).toBe(true)
    expect(dedupe.shouldProcess(third)).toBe(true)
    expect(dedupe.shouldProcess(first)).toBe(true)
  })

  test('dedupes output deltas by runtime envelope cursor', () => {
    const dedupe = new KernelRuntimeOutputDeltaDedupe(2)
    const first = {
      ...createEnvelope(createEvent('turn.output_delta', { text: 'a' })),
      eventId: 'event-output-a',
    }
    const second = createEnvelope({
      ...createEvent('turn.output_delta', { text: 'b' }),
      eventId: 'event-output-b',
    })
    const third = {
      ...createEnvelope(createEvent('turn.output_delta', { text: 'c' })),
      eventId: 'event-output-c',
    }

    expect(dedupe.shouldProcess(first)).toBe(true)
    expect(dedupe.shouldProcess(first)).toBe(false)
    expect(dedupe.shouldProcess(second)).toBe(true)
    expect(dedupe.shouldProcess(third)).toBe(true)
    expect(dedupe.shouldProcess(first)).toBe(true)
  })
})
