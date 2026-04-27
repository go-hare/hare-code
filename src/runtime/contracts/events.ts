import type { KernelConversationId } from './conversation.js'
import type { KernelRuntimeId } from './runtime.js'
import type { KernelTurnId } from './turn.js'

export type KernelEventId = string

export type KernelRuntimeEnvelopeKind =
  | 'ack'
  | 'event'
  | 'error'
  | 'pong'

export type KernelRuntimeErrorCode =
  | 'invalid_request'
  | 'schema_mismatch'
  | 'not_found'
  | 'busy'
  | 'permission_denied'
  | 'aborted'
  | 'unavailable'
  | 'internal_error'

export type KernelRuntimeErrorPayload = {
  code: KernelRuntimeErrorCode
  message: string
  retryable: boolean
  details?: Record<string, unknown>
}

export type KernelEventScope = {
  runtimeId?: KernelRuntimeId
  conversationId?: KernelConversationId
  turnId?: KernelTurnId
}

export type KernelEvent = KernelEventScope & {
  type: string
  eventId?: KernelEventId
  replayable: boolean
  payload?: unknown
  metadata?: Record<string, unknown>
}

export type KernelRuntimeEnvelopeBase<TPayload = unknown> = KernelEventScope & {
  schemaVersion: 'kernel.runtime.v1'
  messageId: string
  requestId?: string
  eventId?: KernelEventId
  sequence: number
  timestamp: string
  source: 'kernel_runtime'
  kind: KernelRuntimeEnvelopeKind
  payload?: TPayload
  error?: KernelRuntimeErrorPayload
  metadata?: Record<string, unknown>
}

export type KernelRuntimeEventSink = (
  envelope: KernelRuntimeEnvelopeBase,
) => void
