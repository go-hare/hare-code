import type {
  KernelEvent,
  KernelRuntimeEnvelopeBase,
} from '../runtime/contracts/events.js'

export type KernelRuntimeEventCategory =
  | 'runtime'
  | 'host'
  | 'conversation'
  | 'turn'
  | 'permission'
  | 'capability'
  | 'compatibility'
  | 'extension'

export type KernelRuntimeEventScope = 'runtime' | 'conversation' | 'turn'

export type KernelRuntimeEventTaxonomyEntry = {
  readonly type: string
  readonly category: KernelRuntimeEventCategory
  readonly scope: KernelRuntimeEventScope
  readonly terminal?: boolean
  readonly compatibility?: boolean
}

export const KERNEL_RUNTIME_EVENT_TAXONOMY = [
  { type: 'runtime.ready', category: 'runtime', scope: 'runtime' },
  { type: 'host.connected', category: 'host', scope: 'runtime' },
  { type: 'host.reconnected', category: 'host', scope: 'runtime' },
  { type: 'host.disconnected', category: 'host', scope: 'runtime' },
  { type: 'host.focus_changed', category: 'host', scope: 'runtime' },
  {
    type: 'conversation.ready',
    category: 'conversation',
    scope: 'conversation',
  },
  {
    type: 'conversation.recovered',
    category: 'conversation',
    scope: 'conversation',
  },
  {
    type: 'conversation.disposed',
    category: 'conversation',
    scope: 'conversation',
    terminal: true,
  },
  {
    type: 'conversation.snapshot_failed',
    category: 'conversation',
    scope: 'conversation',
  },
  { type: 'turn.started', category: 'turn', scope: 'turn' },
  { type: 'turn.abort_requested', category: 'turn', scope: 'turn' },
  { type: 'turn.output_delta', category: 'turn', scope: 'turn' },
  { type: 'turn.delta', category: 'turn', scope: 'turn' },
  { type: 'turn.progress', category: 'turn', scope: 'turn' },
  {
    type: 'turn.completed',
    category: 'turn',
    scope: 'turn',
    terminal: true,
  },
  { type: 'turn.failed', category: 'turn', scope: 'turn', terminal: true },
  { type: 'permission.requested', category: 'permission', scope: 'turn' },
  { type: 'permission.resolved', category: 'permission', scope: 'turn' },
  {
    type: 'capabilities.required',
    category: 'capability',
    scope: 'conversation',
  },
  { type: 'capabilities.reloaded', category: 'capability', scope: 'runtime' },
  { type: 'commands.executed', category: 'extension', scope: 'runtime' },
  { type: 'tools.called', category: 'extension', scope: 'runtime' },
  { type: 'mcp.reloaded', category: 'extension', scope: 'runtime' },
  { type: 'mcp.connected', category: 'extension', scope: 'runtime' },
  { type: 'mcp.authenticated', category: 'extension', scope: 'runtime' },
  { type: 'mcp.enabled_changed', category: 'extension', scope: 'runtime' },
  { type: 'hooks.reloaded', category: 'extension', scope: 'runtime' },
  { type: 'hooks.ran', category: 'extension', scope: 'runtime' },
  { type: 'hooks.registered', category: 'extension', scope: 'runtime' },
  { type: 'skills.reloaded', category: 'extension', scope: 'runtime' },
  {
    type: 'skills.context_resolved',
    category: 'extension',
    scope: 'runtime',
  },
  { type: 'plugins.reloaded', category: 'extension', scope: 'runtime' },
  {
    type: 'plugins.enabled_changed',
    category: 'extension',
    scope: 'runtime',
  },
  { type: 'plugins.installed', category: 'extension', scope: 'runtime' },
  { type: 'plugins.uninstalled', category: 'extension', scope: 'runtime' },
  { type: 'plugins.updated', category: 'extension', scope: 'runtime' },
  { type: 'agents.reloaded', category: 'extension', scope: 'runtime' },
  { type: 'agents.spawned', category: 'extension', scope: 'runtime' },
  { type: 'agents.run.cancelled', category: 'extension', scope: 'runtime' },
  { type: 'tasks.created', category: 'extension', scope: 'runtime' },
  { type: 'tasks.updated', category: 'extension', scope: 'runtime' },
  { type: 'tasks.assigned', category: 'extension', scope: 'runtime' },
  {
    type: 'headless.sdk_message',
    category: 'compatibility',
    scope: 'turn',
    compatibility: true,
  },
] as const satisfies readonly KernelRuntimeEventTaxonomyEntry[]

export type KernelRuntimeEventType =
  (typeof KERNEL_RUNTIME_EVENT_TAXONOMY)[number]['type']

export type KernelEventType = KernelRuntimeEventType | (string & {})

export type KernelTurnEventType = Extract<
  KernelRuntimeEventType,
  `turn.${string}`
>

export const KERNEL_RUNTIME_EVENT_TYPES = KERNEL_RUNTIME_EVENT_TAXONOMY.map(
  entry => entry.type,
) as readonly KernelRuntimeEventType[]

export type KernelRuntimeEventEnvelope =
  KernelRuntimeEnvelopeBase<KernelEvent> & {
    kind: 'event'
    payload: KernelEvent
  }

export type KnownKernelRuntimeEventEnvelope<
  TType extends KernelRuntimeEventType = KernelRuntimeEventType,
> = KernelRuntimeEventEnvelope & {
  payload: KernelEvent & { type: TType }
}

export type KernelTurnOutputDeltaEvent =
  KnownKernelRuntimeEventEnvelope<'turn.output_delta'>

export type KernelTurnCompletedEvent =
  KnownKernelRuntimeEventEnvelope<'turn.completed'>

export type KernelTurnFailedEvent =
  KnownKernelRuntimeEventEnvelope<'turn.failed'>

export type KernelKnownEvent = KnownKernelRuntimeEventEnvelope

export type KernelRuntimeEventHandler = (
  envelope: KernelRuntimeEventEnvelope,
) => void

export function collectKernelRuntimeEventEnvelopes(
  envelopes: readonly KernelRuntimeEnvelopeBase[],
): KernelRuntimeEventEnvelope[] {
  return envelopes.filter(isKernelRuntimeEventEnvelope)
}

export function isKernelRuntimeEventEnvelope(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KernelRuntimeEventEnvelope {
  return (
    envelope.kind === 'event' &&
    isRecord(envelope.payload) &&
    typeof envelope.payload.type === 'string'
  )
}

export function isKnownKernelRuntimeEventType(
  type: string,
): type is KernelRuntimeEventType {
  return getKnownTaxonomyEntry(type) !== undefined
}

export function getKernelRuntimeEventType(
  input: KernelRuntimeEnvelopeBase | KernelEvent | unknown,
): string | undefined {
  const event = isKernelRuntimeEventEnvelopeLike(input)
    ? input.payload
    : isKernelEventLike(input)
      ? input
      : undefined
  return event?.type
}

export function getKernelRuntimeEventCategory(
  input: KernelRuntimeEnvelopeBase | KernelEvent | string | unknown,
): KernelRuntimeEventCategory | undefined {
  const type =
    typeof input === 'string' ? input : getKernelRuntimeEventType(input)
  if (!type) {
    return undefined
  }
  return getKnownTaxonomyEntry(type)?.category ?? inferEventCategory(type)
}

export function getKernelRuntimeEventTaxonomyEntry(
  type: string,
): KernelRuntimeEventTaxonomyEntry | undefined {
  return getKnownTaxonomyEntry(type) ?? createPrefixTaxonomyEntry(type)
}

export function isKernelRuntimeEventOfType<
  TType extends KernelRuntimeEventType,
>(
  envelope: KernelRuntimeEnvelopeBase,
  type: TType,
): envelope is KnownKernelRuntimeEventEnvelope<TType> {
  return (
    isKernelRuntimeEventEnvelope(envelope) && envelope.payload.type === type
  )
}

export function isKernelTurnTerminalEvent(
  envelope: KernelRuntimeEnvelopeBase,
): envelope is KnownKernelRuntimeEventEnvelope<
  'turn.completed' | 'turn.failed'
> {
  return (
    isKernelRuntimeEventOfType(envelope, 'turn.completed') ||
    isKernelRuntimeEventOfType(envelope, 'turn.failed')
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getKnownTaxonomyEntry(
  type: string,
): (typeof KERNEL_RUNTIME_EVENT_TAXONOMY)[number] | undefined {
  return KERNEL_RUNTIME_EVENT_TAXONOMY.find(entry => entry.type === type)
}

function isKernelRuntimeEventEnvelopeLike(
  value: unknown,
): value is KernelRuntimeEventEnvelope {
  return (
    isRecord(value) &&
    value.kind === 'event' &&
    isKernelEventLike(value.payload)
  )
}

function isKernelEventLike(value: unknown): value is KernelEvent {
  return isRecord(value) && typeof value.type === 'string'
}

function inferEventCategory(
  type: string,
): KernelRuntimeEventCategory | undefined {
  const prefix = type.split('.', 1)[0]
  switch (prefix) {
    case 'runtime':
    case 'host':
    case 'conversation':
    case 'turn':
      return prefix
    case 'permission':
      return 'permission'
    case 'capability':
    case 'capabilities':
      return 'capability'
    case 'agents':
    case 'tasks':
      return 'extension'
    case 'headless':
      return 'compatibility'
    default:
      return type.includes('.') ? 'extension' : undefined
  }
}

function inferEventScope(type: string): KernelRuntimeEventScope {
  const category = inferEventCategory(type)
  if (category === 'turn' || category === 'permission') {
    return 'turn'
  }
  if (category === 'conversation' || category === 'capability') {
    return 'conversation'
  }
  return 'runtime'
}

function createPrefixTaxonomyEntry(
  type: string,
): KernelRuntimeEventTaxonomyEntry | undefined {
  const category = inferEventCategory(type)
  if (!category) {
    return undefined
  }
  return {
    type,
    category,
    scope: inferEventScope(type),
  }
}
