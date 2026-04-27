import type {
  KernelEvent,
  KernelRuntimeEnvelopeBase,
  KernelRuntimeEventSink,
} from '../../contracts/events.js'
import type {
  RuntimeEventInput,
  RuntimeEventReplayRequest,
} from './RuntimeEventBus.js'
import {
  RuntimeEventBus,
  RuntimeEventReplayError,
} from './RuntimeEventBus.js'
import {
  consumeKernelRuntimeEventMessage,
  getKernelRuntimeEnvelopeFromMessage,
  isKernelRuntimeEnvelope,
  toKernelRuntimeEventMessage,
  type KernelRuntimeEventMessage,
} from '../../../utils/kernelRuntimeEventMessage.js'

export {
  consumeKernelRuntimeEventMessage,
  getKernelRuntimeEnvelopeFromMessage,
  isKernelRuntimeEnvelope,
  RuntimeEventReplayError as KernelRuntimeEventReplayError,
  toKernelRuntimeEventMessage,
  type KernelRuntimeEventMessage,
}

export type KernelRuntimeEventInput = RuntimeEventInput
export type KernelRuntimeEventReplayRequest = RuntimeEventReplayRequest

export type KernelRuntimeEventFacadeOptions = {
  runtimeId: string
  maxReplayEvents?: number
  initialReplayEnvelopes?: readonly KernelRuntimeEnvelopeBase<KernelEvent>[]
  onEvent?: KernelRuntimeEventSink
  now?: () => string
  createMessageId?: () => string
}

export type KernelRuntimeEventFacade = {
  emit(event: KernelRuntimeEventInput): KernelRuntimeEnvelopeBase<KernelEvent>
  ingestEnvelope(envelope: KernelRuntimeEnvelopeBase): boolean
  ingestMessage(message: unknown): KernelRuntimeEnvelopeBase | undefined
  subscribe(handler: KernelRuntimeEventSink): () => void
  replay(
    request?: KernelRuntimeEventReplayRequest,
  ): Array<KernelRuntimeEnvelopeBase<KernelEvent>>
}

type ReplayEnvelope = KernelRuntimeEnvelopeBase<KernelEvent>

export function createKernelRuntimeEventFacade(
  options: KernelRuntimeEventFacadeOptions,
): KernelRuntimeEventFacade {
  const replayBuffer: ReplayEnvelope[] = []
  const replayableScopesByEventId = new Map<
    string,
    Pick<KernelRuntimeEnvelopeBase, 'runtimeId' | 'conversationId' | 'turnId'>
  >()
  const seenMessageIds = new Set<string>()
  const listeners = new Set<KernelRuntimeEventSink>()
  const maxReplayEvents = Math.max(
    0,
    Math.floor(options.maxReplayEvents ?? 512),
  )

  const notify = (envelope: KernelRuntimeEnvelopeBase): void => {
    try {
      options.onEvent?.(envelope)
    } catch {
      // Host observation must not affect runtime event flow.
    }
    for (const listener of listeners) {
      try {
        listener(envelope)
      } catch {
        // Host observation must not affect runtime event flow.
      }
    }
  }

  const recordEnvelope = (
    envelope: KernelRuntimeEnvelopeBase,
    shouldNotify: boolean,
  ): boolean => {
    if (seenMessageIds.has(envelope.messageId)) {
      return false
    }
    if (envelope.eventId && replayableScopesByEventId.has(envelope.eventId)) {
      return false
    }

    seenMessageIds.add(envelope.messageId)
    const replayEnvelope = getReplayableKernelEventEnvelope(envelope)
    if (replayEnvelope) {
      replayableScopesByEventId.set(replayEnvelope.eventId!, {
        runtimeId: replayEnvelope.runtimeId,
        conversationId: replayEnvelope.conversationId,
        turnId: replayEnvelope.turnId,
      })
      replayBuffer.push(replayEnvelope)
      const overflow = replayBuffer.length - maxReplayEvents
      if (overflow > 0) {
        replayBuffer.splice(0, overflow)
      }
    }

    if (shouldNotify) {
      notify(envelope)
    }
    return true
  }

  for (const envelope of options.initialReplayEnvelopes ?? []) {
    recordEnvelope(envelope, false)
  }

  const eventBus = new RuntimeEventBus({
    runtimeId: options.runtimeId,
    maxReplayEvents,
    initialReplayEnvelopes: options.initialReplayEnvelopes,
    now: options.now,
    createMessageId: options.createMessageId,
  })
  eventBus.subscribe(envelope => {
    recordEnvelope(envelope, true)
  })

  return {
    emit(event) {
      return eventBus.emit(event)
    },
    ingestEnvelope(envelope) {
      if (!isKernelRuntimeEnvelope(envelope)) {
        return false
      }
      return recordEnvelope(envelope, true)
    },
    ingestMessage(message) {
      const envelope = getKernelRuntimeEnvelopeFromMessage(message)
      if (!envelope) {
        return undefined
      }
      return recordEnvelope(envelope, true) ? envelope : undefined
    },
    subscribe(handler) {
      listeners.add(handler)
      return () => {
        listeners.delete(handler)
      }
    },
    replay(request = {}) {
      return replayKernelRuntimeEvents(
        replayBuffer,
        replayableScopesByEventId,
        request,
      )
    },
  }
}

export function getKernelEventFromEnvelope(
  envelope: KernelRuntimeEnvelopeBase,
): KernelEvent | undefined {
  if (envelope.kind !== 'event') {
    return undefined
  }
  const payload = envelope.payload
  if (typeof payload !== 'object' || payload === null) {
    return undefined
  }
  const record = payload as Record<string, unknown>
  if (
    typeof record.type !== 'string' ||
    typeof record.replayable !== 'boolean'
  ) {
    return undefined
  }
  return payload as KernelEvent
}

function getReplayableKernelEventEnvelope(
  envelope: KernelRuntimeEnvelopeBase,
): ReplayEnvelope | undefined {
  const event = getKernelEventFromEnvelope(envelope)
  if (!event?.replayable || !envelope.eventId) {
    return undefined
  }
  return envelope as ReplayEnvelope
}

function replayKernelRuntimeEvents(
  replayBuffer: readonly ReplayEnvelope[],
  replayableScopesByEventId: ReadonlyMap<
    string,
    Pick<KernelRuntimeEnvelopeBase, 'runtimeId' | 'conversationId' | 'turnId'>
  >,
  request: KernelRuntimeEventReplayRequest,
): ReplayEnvelope[] {
  const scopedEnvelopes = replayBuffer.filter(envelope =>
    matchesReplayRequest(envelope, request),
  )

  if (!request.sinceEventId) {
    return [...scopedEnvelopes]
  }

  const cursorIndex = scopedEnvelopes.findIndex(
    envelope => envelope.eventId === request.sinceEventId,
  )
  if (cursorIndex !== -1) {
    return scopedEnvelopes.slice(cursorIndex + 1)
  }

  const cursorScope = replayableScopesByEventId.get(request.sinceEventId)
  if (!cursorScope || !matchesReplayRequest(cursorScope, request)) {
    throw new RuntimeEventReplayError('not_found', request.sinceEventId)
  }

  throw new RuntimeEventReplayError('expired', request.sinceEventId)
}

function matchesReplayRequest(
  scope: Pick<KernelRuntimeEnvelopeBase, 'conversationId' | 'turnId'>,
  request: KernelRuntimeEventReplayRequest,
): boolean {
  if (
    request.conversationId &&
    scope.conversationId !== request.conversationId
  ) {
    return false
  }
  if (request.turnId && scope.turnId !== request.turnId) {
    return false
  }
  return true
}
