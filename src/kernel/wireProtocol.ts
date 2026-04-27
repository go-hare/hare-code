import { createInterface } from 'readline'
import type { Readable, Writable } from 'stream'

import { createHeadlessConversation } from '../runtime/capabilities/execution/internal/headlessConversationAdapter.js'
import { createDefaultRuntimeCapabilityResolver } from '../runtime/capabilities/defaultRuntimeCapabilities.js'
import { RuntimePermissionBroker } from '../runtime/capabilities/permissions/RuntimePermissionBroker.js'
import { RuntimeConversationSnapshotJournal } from '../runtime/core/conversation/RuntimeConversationSnapshotJournal.js'
import { RuntimeEventBus } from '../runtime/core/events/RuntimeEventBus.js'
import { RuntimeEventFileJournal } from '../runtime/core/events/RuntimeEventJournal.js'
import {
  createKernelRuntimeWireRouter,
  type KernelRuntimeWireCapabilityResolver,
  type KernelRuntimeWirePermissionBroker,
  type KernelRuntimeWireRouter,
  type KernelRuntimeWireTurnExecutor,
} from '../runtime/core/wire/KernelRuntimeWireRouter.js'
import {
  createKernelRuntimeHeadlessProcessExecutor,
  readHeadlessProcessExecutorOptionsFromEnv,
  type KernelRuntimeHeadlessProcessExecutorOptions,
} from '../runtime/core/wire/KernelRuntimeHeadlessProcessExecutor.js'
import {
  createKernelRuntimeInProcessWireTransport,
  createKernelRuntimeStdioWireTransport,
  createKernelRuntimeWireClient,
} from '../runtime/core/wire/KernelRuntimeWireTransport.js'
import { serializeKernelRuntimeEnvelope } from '../runtime/core/wire/KernelRuntimeWireCodec.js'
import type { KernelRuntimeEnvelopeBase } from '../runtime/contracts/events.js'
import type { KernelRuntimeId } from '../runtime/contracts/runtime.js'

export type KernelRuntimeWireProtocolOptions = {
  runtimeId?: KernelRuntimeId
  workspacePath?: string
  eventBus?: RuntimeEventBus
  eventJournalPath?: string | false
  conversationJournalPath?: string | false
  maxReplayEvents?: number
  capabilityResolver?: KernelRuntimeWireCapabilityResolver
  permissionBroker?: KernelRuntimeWirePermissionBroker
  runTurnExecutor?: KernelRuntimeWireTurnExecutor
  headlessExecutor?: false | KernelRuntimeHeadlessProcessExecutorOptions
}

export type KernelRuntimeWireRunnerOptions =
  KernelRuntimeWireProtocolOptions & {
    input?: Readable
    output?: Pick<Writable, 'write'>
  }

export function createDefaultKernelRuntimeWireRouter(
  options: KernelRuntimeWireProtocolOptions = {},
): KernelRuntimeWireRouter {
  const runtimeId = options.runtimeId ?? 'kernel-runtime'
  const eventJournalPath =
    options.eventJournalPath === false
      ? undefined
      : (options.eventJournalPath ??
        process.env.HARE_KERNEL_RUNTIME_EVENT_JOURNAL)
  const eventJournal = eventJournalPath
    ? new RuntimeEventFileJournal(eventJournalPath, options.maxReplayEvents)
    : undefined
  const conversationJournalPath =
    options.conversationJournalPath === false
      ? undefined
      : (options.conversationJournalPath ??
        process.env.HARE_KERNEL_RUNTIME_CONVERSATION_JOURNAL)
  const conversationJournal = conversationJournalPath
    ? new RuntimeConversationSnapshotJournal(conversationJournalPath)
    : undefined
  const eventBus =
    options.eventBus ??
    new RuntimeEventBus({
      runtimeId,
      maxReplayEvents: options.maxReplayEvents,
      initialReplayEnvelopes: eventJournal?.readReplayableEnvelopes(),
    })
  if (eventJournal) {
    eventBus.subscribe(envelope => {
      eventJournal.append(envelope)
    })
  }
  const permissionBroker =
    options.permissionBroker ??
    new RuntimePermissionBroker({
      eventBus,
    })

  const headlessExecutorOptions =
    options.headlessExecutor === false
      ? undefined
      : (options.headlessExecutor ??
        readHeadlessProcessExecutorOptionsFromEnv())
  const runTurnExecutor =
    options.runTurnExecutor ??
    (headlessExecutorOptions
      ? createKernelRuntimeHeadlessProcessExecutor(headlessExecutorOptions)
      : undefined)

  return createKernelRuntimeWireRouter({
    runtimeId,
    workspacePath: options.workspacePath ?? process.cwd(),
    eventBus,
    conversationSnapshotStore: conversationJournal,
    capabilityResolver:
      options.capabilityResolver ??
      createDefaultRuntimeCapabilityResolver({
        cwd: options.workspacePath ?? process.cwd(),
      }),
    runTurnExecutor,
    permissionBroker,
    createConversation: conversationOptions =>
      createHeadlessConversation(conversationOptions),
  })
}

export async function runKernelRuntimeWireProtocol(
  options: KernelRuntimeWireRunnerOptions = {},
): Promise<void> {
  const router = createDefaultKernelRuntimeWireRouter(options)
  const input = options.input ?? process.stdin
  const output = options.output ?? process.stdout

  const writeEnvelope = (envelope: KernelRuntimeEnvelopeBase): void => {
    output.write(`${serializeKernelRuntimeEnvelope(envelope)}\n`)
  }

  const unsubscribe = router.eventBus.subscribe(envelope => {
    if (envelope.kind === 'event') {
      writeEnvelope(envelope)
    }
  })

  try {
    const lines = createInterface({
      input,
      crlfDelay: Number.POSITIVE_INFINITY,
    })
    for await (const line of lines) {
      if (line.trim().length === 0) {
        continue
      }
      const responses = await router.handleCommandLine(line)
      for (const envelope of responses) {
        writeEnvelope(envelope)
      }
    }
  } finally {
    unsubscribe()
  }
}

export {
  createKernelRuntimeInProcessWireTransport,
  createKernelRuntimeStdioWireTransport,
  createKernelRuntimeWireClient,
}
export { KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION } from '../runtime/contracts/wire.js'
export type {
  KernelRuntimeCommand,
  KernelRuntimeCommandType,
  KernelRuntimeConnectHostCommand,
  KernelRuntimeDecidePermissionCommand,
  KernelRuntimeDisconnectHostCommand,
  KernelRuntimeHostDisconnectPolicy,
} from '../runtime/contracts/wire.js'
export type {
  KernelPermissionDecision,
  KernelPermissionDecisionSource,
  KernelPermissionDecisionValue,
  KernelPermissionRequest,
  KernelPermissionRequestId,
  KernelPermissionRisk,
} from '../runtime/contracts/permissions.js'
export type {
  KernelRuntimeWireCapabilityResolver,
  KernelRuntimeWireRouter,
} from '../runtime/core/wire/KernelRuntimeWireRouter.js'
export type {
  KernelRuntimeInProcessWireTransportOptions,
  KernelRuntimeStdioWireTransportOptions,
  KernelRuntimeWireClient,
  KernelRuntimeWireClientCommand,
  KernelRuntimeWireClientOptions,
  KernelRuntimeWireTransport,
} from '../runtime/core/wire/KernelRuntimeWireTransport.js'
export type { KernelRuntimeHeadlessProcessExecutorOptions } from '../runtime/core/wire/KernelRuntimeHeadlessProcessExecutor.js'
export type {
  KernelRuntimeWireConversationRecoverySnapshot,
  KernelRuntimeWireConversationSnapshotStore,
  KernelRuntimeWirePermissionBroker,
  KernelRuntimeWireTurnExecutionContext,
  KernelRuntimeWireTurnExecutionEvent,
  KernelRuntimeWireTurnExecutionResult,
  KernelRuntimeWireTurnExecutor,
} from '../runtime/core/wire/KernelRuntimeWireRouter.js'
export type {
  KernelEvent,
  KernelRuntimeEnvelopeBase,
  KernelRuntimeErrorCode,
  KernelRuntimeErrorPayload,
} from '../runtime/contracts/events.js'
export type {
  KernelCapabilityDescriptor,
  KernelCapabilityReloadScope,
} from '../runtime/contracts/capability.js'
export type {
  KernelRuntimeHostIdentity,
  KernelRuntimeHostKind,
  KernelRuntimeTransportKind,
  KernelRuntimeTrustLevel,
} from '../runtime/contracts/runtime.js'
