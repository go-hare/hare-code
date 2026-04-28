import type {
  KernelRuntimeEnvelopeBase,
  KernelRuntimeEventSink,
} from '../runtime/contracts/events.js'
import type { KernelCapabilityDescriptor } from '../runtime/contracts/capability.js'
import type { KernelRuntimeWireClient } from './wireProtocol.js'
import type { KernelRuntimeEventReplayOptions } from './runtime.js'
import { KernelRuntimeRequestError } from './runtimeErrors.js'

export function expectSuccess(
  envelope: KernelRuntimeEnvelopeBase,
): KernelRuntimeEnvelopeBase {
  if (envelope.kind === 'error') {
    throw new KernelRuntimeRequestError(envelope)
  }
  return envelope
}

export function expectPayload<TPayload>(
  envelope: KernelRuntimeEnvelopeBase,
): TPayload {
  const successful = expectSuccess(envelope)
  return successful.payload as TPayload
}

export async function collectReplayEvents(
  client: KernelRuntimeWireClient,
  options: KernelRuntimeEventReplayOptions,
): Promise<KernelRuntimeEnvelopeBase[]> {
  const events: KernelRuntimeEnvelopeBase[] = []
  const unsubscribe = client.onEvent(createReplayCollector(events, options))
  try {
    expectSuccess(
      await client.subscribeEvents({
        type: 'subscribe_events',
        conversationId: options.conversationId,
        turnId: options.turnId,
        sinceEventId: options.sinceEventId,
        filters: options.filters,
      }),
    )
    await waitForRuntimeEventDelivery()
    return events
  } finally {
    unsubscribe()
  }
}

export function toCapabilityDescriptors(
  value: unknown,
): readonly KernelCapabilityDescriptor[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter(isCapabilityDescriptor)
}

function createReplayCollector(
  events: KernelRuntimeEnvelopeBase[],
  options: KernelRuntimeEventReplayOptions,
): KernelRuntimeEventSink {
  return envelope => {
    if (envelope.kind === 'event' && matchesReplayOptions(envelope, options)) {
      events.push(envelope)
    }
  }
}

function isCapabilityDescriptor(
  value: unknown,
): value is KernelCapabilityDescriptor {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<KernelCapabilityDescriptor>
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.lazy === 'boolean' &&
    Array.isArray(candidate.dependencies) &&
    typeof candidate.reloadable === 'boolean'
  )
}

function matchesReplayOptions(
  envelope: KernelRuntimeEnvelopeBase,
  options: KernelRuntimeEventReplayOptions,
): boolean {
  if (
    options.conversationId !== undefined &&
    envelope.conversationId !== options.conversationId
  ) {
    return false
  }
  if (options.turnId !== undefined && envelope.turnId !== options.turnId) {
    return false
  }
  return true
}

export function waitForRuntimeEventDelivery(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}
