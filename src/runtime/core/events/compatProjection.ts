import type { SDKMessage } from '../../../entrypoints/agentSdkTypes.js'
import type { StdoutMessage } from '../../../entrypoints/sdk/controlTypes.js'
import type {
  KernelEvent,
  KernelRuntimeEnvelopeBase,
} from '../../contracts/events.js'
import { toKernelRuntimeEventMessage } from '../../../utils/kernelRuntimeEventMessage.js'
import { jsonParse, jsonStringify } from '../../../utils/slowOperations.js'
import { getKernelEventFromEnvelope } from './KernelRuntimeEventFacade.js'

export type SDKResultTurnOutcome = {
  eventType: 'turn.completed' | 'turn.failed'
  state: 'completed' | 'failed'
  stopReason: string | null
}

export type LegacyStreamJsonProjectionOptions = {
  sessionId?: string
  includeRuntimeEvent?: boolean
  includeSDKMessage?: boolean
}

export function cloneSDKMessageForRuntimeEvent(message: SDKMessage): SDKMessage {
  return jsonParse(jsonStringify(message)) as SDKMessage
}

export function sdkMessageToRuntimeEvent({
  conversationId,
  turnId,
  message,
  metadata,
}: {
  conversationId: string
  turnId?: string
  message: SDKMessage
  metadata?: Record<string, unknown>
}): KernelEvent {
  return {
    conversationId,
    turnId,
    type: 'headless.sdk_message',
    replayable: true,
    payload: cloneSDKMessageForRuntimeEvent(message),
    ...(metadata ? { metadata } : {}),
  }
}

export const createHeadlessSDKMessageRuntimeEvent = sdkMessageToRuntimeEvent

export function runtimeEnvelopeToSDKMessage(
  envelope: KernelRuntimeEnvelopeBase,
): SDKMessage | undefined {
  const event = getKernelEventFromEnvelope(envelope)
  if (event?.type !== 'headless.sdk_message') {
    return undefined
  }
  return isSDKMessageLike(event.payload) ? event.payload : undefined
}

export const getSDKMessageFromRuntimeEnvelope = runtimeEnvelopeToSDKMessage
export const projectRuntimeEnvelopeToLegacySDKMessage =
  runtimeEnvelopeToSDKMessage

export function getSDKResultTurnOutcome(
  message: SDKMessage,
): SDKResultTurnOutcome {
  const failed = isErrorSDKResultMessage(message)
  return {
    eventType: failed ? 'turn.failed' : 'turn.completed',
    state: failed ? 'failed' : 'completed',
    stopReason: stopReasonFromSDKResultMessage(message),
  }
}

export function isErrorSDKResultMessage(message: SDKMessage): boolean {
  const record = message as Record<string, unknown>
  return record.is_error === true
}

export function stopReasonFromSDKResultMessage(
  message: SDKMessage,
): string | null {
  const record = message as Record<string, unknown>
  if (typeof record.stop_reason === 'string') {
    return record.stop_reason
  }
  switch (record.subtype) {
    case 'error_max_budget_usd':
    case 'error_max_turns':
    case 'error_max_structured_output_retries':
      return 'max_turn_requests'
    default:
      return null
  }
}

export function sdkMessageToStreamJsonMessages(
  message: SDKMessage,
): StdoutMessage[] {
  return [message as unknown as StdoutMessage]
}

export const projectSDKMessageToLegacyStreamJsonMessages =
  sdkMessageToStreamJsonMessages

export function runtimeEnvelopeToStreamJsonMessages(
  envelope: KernelRuntimeEnvelopeBase,
  options: LegacyStreamJsonProjectionOptions = {},
): StdoutMessage[] {
  const messages: StdoutMessage[] = []
  if (options.includeRuntimeEvent) {
    messages.push(
      toKernelRuntimeEventMessage(
        envelope,
        options.sessionId ?? envelope.conversationId ?? '',
      ) as unknown as StdoutMessage,
    )
  }

  if (options.includeSDKMessage !== false) {
    const sdkMessage = runtimeEnvelopeToSDKMessage(envelope)
    if (sdkMessage) {
      messages.push(...sdkMessageToStreamJsonMessages(sdkMessage))
    }
  }
  return messages
}

export const projectRuntimeEnvelopeToLegacyStreamJsonMessages =
  runtimeEnvelopeToStreamJsonMessages

export class KernelRuntimeSDKMessageDedupe {
  private readonly seen = new Set<string>()
  private readonly order: string[] = []

  constructor(private readonly maxSize = 512) {}

  shouldProcess(message: SDKMessage): boolean {
    return dedupeSDKMessage(message, this.seen, this.order, this.maxSize)
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
    return dedupeKey(key, this.seen, this.order, this.maxSize)
  }

  clear(): void {
    this.seen.clear()
    this.order.length = 0
  }
}

export function dedupeSDKMessage(
  message: SDKMessage,
  seen: Set<string>,
  order: string[],
  maxSize = 512,
): boolean {
  const key = getSDKMessageDedupeKey(message)
  if (!key) {
    return true
  }
  return dedupeKey(key, seen, order, maxSize)
}

export function getSDKMessageDedupeKey(
  message: SDKMessage,
): string | undefined {
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

export function isSDKMessageLike(value: unknown): value is SDKMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as { type?: unknown }).type === 'string'
  )
}

function dedupeKey(
  key: string,
  seen: Set<string>,
  order: string[],
  maxSize: number,
): boolean {
  if (seen.has(key)) {
    return false
  }
  seen.add(key)
  order.push(key)
  while (order.length > maxSize) {
    const oldest = order.shift()
    if (oldest) {
      seen.delete(oldest)
    }
  }
  return true
}
