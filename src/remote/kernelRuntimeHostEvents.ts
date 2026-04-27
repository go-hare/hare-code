import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'
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

export function getSDKMessageFromKernelRuntimeEnvelope(
  envelope: KernelRuntimeEnvelopeBase,
): SDKMessage | undefined {
  const event = getKernelEventFromEnvelope(envelope)
  if (event?.type !== 'headless.sdk_message') {
    return undefined
  }
  return isSDKMessageLike(event.payload) ? event.payload : undefined
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

export class KernelRuntimeSDKMessageDedupe {
  private readonly seen = new Set<string>()
  private readonly order: string[] = []

  constructor(private readonly maxSize = 512) {}

  shouldProcess(message: SDKMessage): boolean {
    const key = getSDKMessageDedupeKey(message)
    if (!key) {
      return true
    }
    if (this.seen.has(key)) {
      return false
    }
    this.seen.add(key)
    this.order.push(key)
    while (this.order.length > this.maxSize) {
      const oldest = this.order.shift()
      if (oldest) {
        this.seen.delete(oldest)
      }
    }
    return true
  }

  clear(): void {
    this.seen.clear()
    this.order.length = 0
  }
}

export class KernelRuntimeOutputDeltaDedupe {
  private readonly seen = new Set<string>()
  private readonly order: string[] = []

  constructor(private readonly maxSize = 512) {}

  shouldProcess(envelope: KernelRuntimeEnvelopeBase): boolean {
    const key = envelope.eventId ?? envelope.messageId
    if (!key) {
      return true
    }
    if (this.seen.has(key)) {
      return false
    }
    this.seen.add(key)
    this.order.push(key)
    while (this.order.length > this.maxSize) {
      const oldest = this.order.shift()
      if (oldest) {
        this.seen.delete(oldest)
      }
    }
    return true
  }

  clear(): void {
    this.seen.clear()
    this.order.length = 0
  }
}

function getSDKMessageDedupeKey(message: SDKMessage): string | undefined {
  if (typeof message.uuid === 'string' && message.uuid.length > 0) {
    return `uuid:${message.uuid}`
  }
  const nestedMessage = message.message
  if (
    typeof nestedMessage === 'object' &&
    nestedMessage !== null &&
    'id' in nestedMessage &&
    typeof (nestedMessage as { id?: unknown }).id === 'string'
  ) {
    return `${message.type}:message:${(nestedMessage as { id: string }).id}`
  }
  return undefined
}

function isSDKMessageLike(value: unknown): value is SDKMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as { type?: unknown }).type === 'string'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
