import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'
import {
  getSDKMessageFromRuntimeEnvelope as getSDKMessageFromKernelRuntimeEnvelope,
  KernelRuntimeOutputDeltaDedupe,
  KernelRuntimeSDKMessageDedupe,
} from '../runtime/core/events/compatProjection.js'
import type {
  KernelEvent,
  KernelRuntimeEnvelopeBase,
  KernelRuntimeEventSink,
} from '../runtime/contracts/events.js'
import { getKernelEventFromEnvelope } from '../runtime/core/events/KernelRuntimeEventFacade.js'

export type KernelRuntimeHostEventCallbacks = {
  onRuntimeEvent?: KernelRuntimeEventSink
  onRuntimeHeartbeat?: (
    envelope: KernelRuntimeEnvelopeBase,
    event: KernelEvent,
  ) => void
  onOutputDelta?: (
    delta: KernelRuntimeTextOutputDelta,
    envelope: KernelRuntimeEnvelopeBase,
    event: KernelEvent,
  ) => void
  onSDKMessage?: (
    message: SDKMessage,
    envelope: KernelRuntimeEnvelopeBase,
    event: KernelEvent,
  ) => void
  onTurnTerminal?: (
    envelope: KernelRuntimeEnvelopeBase,
    event: KernelEvent,
  ) => void
}

export function handleKernelRuntimeHostEvent(
  envelope: KernelRuntimeEnvelopeBase,
  callbacks: KernelRuntimeHostEventCallbacks,
): void {
  callbacks.onRuntimeEvent?.(envelope)

  const event = getKernelEventFromEnvelope(envelope)
  if (!event) {
    return
  }

  callbacks.onRuntimeHeartbeat?.(envelope, event)
  const sdkMessage = getSDKMessageFromKernelRuntimeEnvelope(envelope)
  if (sdkMessage) {
    callbacks.onSDKMessage?.(sdkMessage, envelope, event)
  }
  const outputDelta = getTextOutputDeltaFromKernelRuntimeEnvelope(envelope)
  if (outputDelta) {
    callbacks.onOutputDelta?.(outputDelta, envelope, event)
  }
  if (isKernelTurnTerminalEvent(event)) {
    callbacks.onTurnTerminal?.(envelope, event)
  }
}

export function isKernelTurnTerminalEvent(event: KernelEvent): boolean {
  return event.type === 'turn.completed' || event.type === 'turn.failed'
}

export type KernelRuntimeTextOutputDelta = {
  text: string
}

export function getTextOutputDeltaFromKernelRuntimeEnvelope(
  envelope: KernelRuntimeEnvelopeBase,
): KernelRuntimeTextOutputDelta | undefined {
  const event = getKernelEventFromEnvelope(envelope)
  if (event?.type !== 'turn.output_delta') {
    return undefined
  }
  if (!isRecord(event.payload)) {
    return undefined
  }
  if ('message' in event.payload) {
    return undefined
  }
  return typeof event.payload.text === 'string'
    ? { text: event.payload.text }
    : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export {
  getSDKMessageFromKernelRuntimeEnvelope,
  KernelRuntimeOutputDeltaDedupe,
  KernelRuntimeSDKMessageDedupe,
}
