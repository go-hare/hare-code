import type {
  KernelCapabilityReloadScope,
  KernelRuntimeCapabilityReloadRequest,
} from '../../contracts/capability.js'
import type {
  KernelEvent,
  KernelRuntimeEnvelopeBase,
} from '../../contracts/events.js'
import type { KernelRuntimeHostIdentity } from '../../contracts/runtime.js'
import type {
  KernelRuntimeAbortTurnCommand,
  KernelRuntimeCommand,
  KernelRuntimeCommandType,
  KernelRuntimeConnectHostCommand,
  KernelRuntimeCreateConversationCommand,
  KernelRuntimeDecidePermissionCommand,
  KernelRuntimeDisconnectHostCommand,
  KernelRuntimeHostDisconnectPolicy,
  KernelRuntimeDisposeConversationCommand,
  KernelRuntimeInitCommand,
  KernelRuntimePingCommand,
  KernelRuntimePublishHostEventCommand,
  KernelRuntimeReloadCapabilitiesCommand,
  KernelRuntimeRunTurnCommand,
  KernelRuntimeSubscribeEventsCommand,
} from '../../contracts/wire.js'
import { KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION } from '../../contracts/wire.js'

const COMMAND_TYPES = new Set<KernelRuntimeCommandType>([
  'init_runtime',
  'connect_host',
  'disconnect_host',
  'create_conversation',
  'run_turn',
  'abort_turn',
  'decide_permission',
  'dispose_conversation',
  'reload_capabilities',
  'publish_host_event',
  'subscribe_events',
  'ping',
])

type JsonRecord = Record<string, unknown>

export class KernelRuntimeWireCommandParseError extends Error {
  constructor(
    message: string,
    readonly requestId?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'KernelRuntimeWireCommandParseError'
  }
}

export function parseKernelRuntimeCommandLine(
  line: string,
): KernelRuntimeCommand {
  try {
    return parseKernelRuntimeCommand(JSON.parse(line))
  } catch (error) {
    if (error instanceof KernelRuntimeWireCommandParseError) {
      throw error
    }
    throw new KernelRuntimeWireCommandParseError('Invalid JSON command line')
  }
}

export function parseKernelRuntimeCommand(
  input: unknown,
): KernelRuntimeCommand {
  const record = requireRecord(input, 'command')
  const requestId = requireString(record, 'requestId')
  const type = requireCommandType(record)
  const metadata = optionalRecord(record, 'metadata')

  if (record.schemaVersion !== KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION) {
    throw new KernelRuntimeWireCommandParseError(
      'Unsupported kernel runtime command schema version',
      requestId,
      {
        expected: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        actual: record.schemaVersion,
      },
    )
  }

  switch (type) {
    case 'ping':
      return withMetadata<KernelRuntimePingCommand>(
        {
          schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
          type,
          requestId,
        },
        metadata,
      )
    case 'init_runtime':
      return parseInitRuntimeCommand(record, requestId, metadata)
    case 'connect_host':
      return parseConnectHostCommand(record, requestId, metadata)
    case 'disconnect_host':
      return parseDisconnectHostCommand(record, requestId, metadata)
    case 'create_conversation':
      return parseCreateConversationCommand(record, requestId, metadata)
    case 'run_turn':
      return parseRunTurnCommand(record, requestId, metadata)
    case 'abort_turn':
      return parseAbortTurnCommand(record, requestId, metadata)
    case 'decide_permission':
      return parseDecidePermissionCommand(record, requestId, metadata)
    case 'dispose_conversation':
      return parseDisposeConversationCommand(record, requestId, metadata)
    case 'reload_capabilities':
      return parseReloadCapabilitiesCommand(record, requestId, metadata)
    case 'publish_host_event':
      return parsePublishHostEventCommand(record, requestId, metadata)
    case 'subscribe_events':
      return parseSubscribeEventsCommand(record, requestId, metadata)
  }
}

export function serializeKernelRuntimeEnvelope(
  envelope: KernelRuntimeEnvelopeBase,
): string {
  return JSON.stringify(envelope)
}

export function serializeKernelRuntimeEnvelopes(
  envelopes: readonly KernelRuntimeEnvelopeBase[],
): string {
  return envelopes.map(serializeKernelRuntimeEnvelope).join('\n')
}

function parseInitRuntimeCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeInitCommand {
  const command: KernelRuntimeInitCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'init_runtime',
    requestId,
  }
  assignOptional(
    command,
    'host',
    optionalRecord(record, 'host') as KernelRuntimeHostIdentity | undefined,
  )
  assignOptional(
    command,
    'workspacePath',
    optionalString(record, 'workspacePath'),
  )
  assignOptional(command, 'provider', optionalRecord(record, 'provider'))
  assignOptional(command, 'auth', optionalRecord(record, 'auth'))
  assignOptional(command, 'model', optionalString(record, 'model'))
  assignOptional(
    command,
    'capabilities',
    optionalRecord(record, 'capabilities'),
  )
  return withMetadata(command, metadata)
}

function parseConnectHostCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeConnectHostCommand {
  const command: KernelRuntimeConnectHostCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'connect_host',
    requestId,
    host: requireRecordField(record, 'host') as KernelRuntimeHostIdentity,
  }
  assignOptional(
    command,
    'sinceEventId',
    optionalString(record, 'sinceEventId'),
  )
  return withMetadata(command, metadata)
}

function parseDisconnectHostCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeDisconnectHostCommand {
  const command: KernelRuntimeDisconnectHostCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'disconnect_host',
    requestId,
    hostId: requireString(record, 'hostId'),
  }
  assignOptional(command, 'reason', optionalString(record, 'reason'))
  assignOptional(
    command,
    'policy',
    optionalHostDisconnectPolicy(record, 'policy'),
  )
  return withMetadata(command, metadata)
}

function parseCreateConversationCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeCreateConversationCommand {
  const command: KernelRuntimeCreateConversationCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'create_conversation',
    requestId,
    conversationId: requireString(record, 'conversationId'),
    workspacePath: requireString(record, 'workspacePath'),
  }
  assignOptional(command, 'sessionId', optionalString(record, 'sessionId'))
  assignOptional(command, 'sessionMeta', optionalRecord(record, 'sessionMeta'))
  assignOptional(
    command,
    'capabilityIntent',
    optionalRecord(record, 'capabilityIntent'),
  )
  return withMetadata(command, metadata)
}

function parseRunTurnCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeRunTurnCommand {
  const command: KernelRuntimeRunTurnCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'run_turn',
    requestId,
    conversationId: requireString(record, 'conversationId'),
    turnId: requireString(record, 'turnId'),
    prompt: requirePrompt(record, 'prompt'),
  }
  assignOptional(command, 'attachments', optionalArray(record, 'attachments'))
  return withMetadata(command, metadata)
}

function parseAbortTurnCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeAbortTurnCommand {
  const command: KernelRuntimeAbortTurnCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'abort_turn',
    requestId,
    conversationId: requireString(record, 'conversationId'),
    turnId: requireString(record, 'turnId'),
  }
  assignOptional(command, 'reason', optionalString(record, 'reason'))
  return withMetadata(command, metadata)
}

function parseDecidePermissionCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeDecidePermissionCommand {
  const command: KernelRuntimeDecidePermissionCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'decide_permission',
    requestId,
    permissionRequestId: requireString(record, 'permissionRequestId'),
    decision: requirePermissionDecision(record, 'decision'),
    decidedBy: requirePermissionDecisionSource(record, 'decidedBy'),
  }
  assignOptional(command, 'reason', optionalString(record, 'reason'))
  assignOptional(command, 'expiresAt', optionalString(record, 'expiresAt'))
  return withMetadata(command, metadata)
}

function parseDisposeConversationCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeDisposeConversationCommand {
  const command: KernelRuntimeDisposeConversationCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'dispose_conversation',
    requestId,
    conversationId: requireString(record, 'conversationId'),
  }
  assignOptional(command, 'reason', optionalString(record, 'reason'))
  return withMetadata(command, metadata)
}

function parseReloadCapabilitiesCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeReloadCapabilitiesCommand {
  const scope = requireRecordField(
    record,
    'scope',
  ) as KernelCapabilityReloadScope
  const command: KernelRuntimeReloadCapabilitiesCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'reload_capabilities',
    requestId,
    scope,
  }
  assignOptional(
    command,
    'capabilities',
    optionalArray(record, 'capabilities') as readonly string[] | undefined,
  )
  return withMetadata(command, metadata)
}

function parsePublishHostEventCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimePublishHostEventCommand {
  return withMetadata<KernelRuntimePublishHostEventCommand>(
    {
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'publish_host_event',
      requestId,
      event: requireRecordField(record, 'event') as KernelEvent,
    },
    metadata,
  )
}

function parseSubscribeEventsCommand(
  record: JsonRecord,
  requestId: string,
  metadata: JsonRecord | undefined,
): KernelRuntimeSubscribeEventsCommand {
  const command: KernelRuntimeSubscribeEventsCommand = {
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    type: 'subscribe_events',
    requestId,
  }
  assignOptional(
    command,
    'conversationId',
    optionalString(record, 'conversationId'),
  )
  assignOptional(command, 'turnId', optionalString(record, 'turnId'))
  assignOptional(
    command,
    'sinceEventId',
    optionalString(record, 'sinceEventId'),
  )
  assignOptional(command, 'filters', optionalRecord(record, 'filters'))
  return withMetadata(command, metadata)
}

function requireRecord(value: unknown, path: string): JsonRecord {
  if (!isRecord(value)) {
    throw new KernelRuntimeWireCommandParseError(`${path} must be an object`)
  }
  return value
}

function requireRecordField(record: JsonRecord, key: string): JsonRecord {
  return requireRecord(record[key], key)
}

function requireString(record: JsonRecord, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new KernelRuntimeWireCommandParseError(`${key} must be a string`)
  }
  return value
}

function optionalString(record: JsonRecord, key: string): string | undefined {
  const value = record[key]
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'string') {
    throw new KernelRuntimeWireCommandParseError(`${key} must be a string`)
  }
  return value
}

function optionalRecord(
  record: JsonRecord,
  key: string,
): JsonRecord | undefined {
  const value = record[key]
  if (value === undefined) {
    return undefined
  }
  return requireRecord(value, key)
}

function optionalArray(
  record: JsonRecord,
  key: string,
): readonly unknown[] | undefined {
  const value = record[key]
  if (value === undefined) {
    return undefined
  }
  if (!Array.isArray(value)) {
    throw new KernelRuntimeWireCommandParseError(`${key} must be an array`)
  }
  return value
}

function requirePrompt(
  record: JsonRecord,
  key: string,
): string | readonly unknown[] {
  const value = record[key]
  if (typeof value === 'string' || Array.isArray(value)) {
    return value
  }
  throw new KernelRuntimeWireCommandParseError(
    `${key} must be a string or array`,
  )
}

function requireCommandType(record: JsonRecord): KernelRuntimeCommandType {
  const type = requireString(record, 'type')
  if (!COMMAND_TYPES.has(type as KernelRuntimeCommandType)) {
    throw new KernelRuntimeWireCommandParseError(
      `Unsupported command type ${type}`,
      typeof record.requestId === 'string' ? record.requestId : undefined,
      { type },
    )
  }
  return type as KernelRuntimeCommandType
}

function optionalHostDisconnectPolicy(
  record: JsonRecord,
  key: string,
): KernelRuntimeHostDisconnectPolicy | undefined {
  const value = record[key]
  if (value === undefined) {
    return undefined
  }
  if (
    value === 'detach' ||
    value === 'continue' ||
    value === 'abort_active_turns'
  ) {
    return value
  }
  throw new KernelRuntimeWireCommandParseError(
    `${key} must be detach, continue, or abort_active_turns`,
  )
}

function requirePermissionDecision(
  record: JsonRecord,
  key: string,
): KernelRuntimeDecidePermissionCommand['decision'] {
  const value = requireString(record, key)
  if (
    value === 'allow' ||
    value === 'deny' ||
    value === 'allow_once' ||
    value === 'allow_session' ||
    value === 'abort'
  ) {
    return value
  }
  throw new KernelRuntimeWireCommandParseError(
    `${key} must be allow, deny, allow_once, allow_session, or abort`,
  )
}

function requirePermissionDecisionSource(
  record: JsonRecord,
  key: string,
): KernelRuntimeDecidePermissionCommand['decidedBy'] {
  const value = requireString(record, key)
  if (
    value === 'host' ||
    value === 'policy' ||
    value === 'timeout' ||
    value === 'runtime'
  ) {
    return value
  }
  throw new KernelRuntimeWireCommandParseError(
    `${key} must be host, policy, timeout, or runtime`,
  )
}

function withMetadata<T extends { metadata?: Record<string, unknown> }>(
  command: T,
  metadata: JsonRecord | undefined,
): T {
  if (metadata !== undefined) {
    command.metadata = metadata
  }
  return command
}

function assignOptional<
  TTarget extends Record<string, unknown>,
  TKey extends keyof TTarget,
>(target: TTarget, key: TKey, value: TTarget[TKey] | undefined): void {
  if (value !== undefined) {
    target[key] = value
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
