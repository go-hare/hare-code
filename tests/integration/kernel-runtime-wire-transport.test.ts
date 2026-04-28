import { describe, expect, test } from 'bun:test'
import { join } from 'path'

import {
  createDefaultKernelRuntimeWireRouter,
  createKernelRuntimeInProcessWireTransport,
  createKernelRuntimeStdioWireTransport,
  createKernelRuntimeWireClient,
  type KernelRuntimeEnvelopeBase,
  type KernelRuntimeHostIdentity,
  type KernelRuntimeWireClient,
} from '../../src/kernel/wireProtocol.js'
import type { KernelRuntimeDisposeConversationCommand } from '../../src/runtime/contracts/wire.js'
import { RuntimePermissionBroker } from '../../src/runtime/capabilities/permissions/RuntimePermissionBroker.js'

const repoRoot = join(import.meta.dir, '../..')

type RuntimeHarness = {
  name: string
  client: KernelRuntimeWireClient
  events: KernelRuntimeEnvelopeBase[]
  stderr: string[]
}

type RuntimeHarnessOptions = {
  maxReplayEvents?: number
  permissionFlow?: boolean
  abortOnDisconnectFlow?: boolean
  completionFlow?: boolean
  failureFlow?: boolean
  lateAbortFlow?: boolean
}

describe('kernel runtime wire transports', () => {
  test('isolates in-process live events by subscription scope', async () => {
    const router = createDefaultKernelRuntimeWireRouter({
      runtimeId: 'runtime-shared',
      workspacePath: repoRoot,
      headlessExecutor: false,
    })
    const clientAEvents: KernelRuntimeEnvelopeBase[] = []
    const clientBEvents: KernelRuntimeEnvelopeBase[] = []
    const clientA = createKernelRuntimeWireClient(
      createKernelRuntimeInProcessWireTransport({ router }),
      { createRequestId: type => `client-a-${type}` },
    )
    const clientB = createKernelRuntimeWireClient(
      createKernelRuntimeInProcessWireTransport({ router }),
      { createRequestId: type => `client-b-${type}` },
    )
    clientA.onEvent(envelope => clientAEvents.push(envelope))
    clientB.onEvent(envelope => clientBEvents.push(envelope))

    try {
      await clientA.subscribeEvents({ conversationId: 'conversation-a' })
      await clientB.subscribeEvents({ conversationId: 'conversation-b' })

      await clientA.createConversation({
        conversationId: 'conversation-a',
        workspacePath: repoRoot,
      })
      await clientA.createConversation({
        conversationId: 'conversation-b',
        workspacePath: repoRoot,
      })

      await waitForEvent(
        clientAEvents,
        envelope =>
          eventType(envelope) === 'conversation.ready' &&
          envelope.conversationId === 'conversation-a',
      )
      await waitForEvent(
        clientBEvents,
        envelope =>
          eventType(envelope) === 'conversation.ready' &&
          envelope.conversationId === 'conversation-b',
      )

      expect(
        clientAEvents.some(
          envelope => envelope.conversationId === 'conversation-b',
        ),
      ).toBe(false)
      expect(
        clientBEvents.some(
          envelope => envelope.conversationId === 'conversation-a',
        ),
      ).toBe(false)
    } finally {
      await Promise.resolve(clientA.close())
      await Promise.resolve(clientB.close())
    }
  })

  for (const transportName of ['in-process', 'stdio'] as const) {
    test(
      `runs the host conversation contract over ${transportName}`,
      async () => {
        const harness = createHarness(transportName)

        try {
          await runTransportContract(harness)
          expect(harness.stderr.join('')).toBe('')
        } finally {
          await Promise.resolve(harness.client.close())
        }
      },
      { timeout: 30_000 },
    )

    test(
      `isolates concurrent conversations over ${transportName}`,
      async () => {
        const harness = createHarness(transportName)

        try {
          await runMultiConversationIsolationContract(harness)
          expect(harness.stderr.join('')).toBe('')
        } finally {
          await Promise.resolve(harness.client.close())
        }
      },
      { timeout: 30_000 },
    )

    test(
      `keeps duplicate turn start and abort idempotent over ${transportName}`,
      async () => {
        const harness = createHarness(transportName)

        try {
          await runIdempotentTurnContract(harness)
          expect(harness.stderr.join('')).toBe('')
        } finally {
          await Promise.resolve(harness.client.close())
        }
      },
      { timeout: 30_000 },
    )

    test(
      `tracks host reconnect replay cursors over ${transportName}`,
      async () => {
        const harness = createHarness(transportName)

        try {
          await runHostReconnectCursorContract(harness)
          expect(harness.stderr.join('')).toBe('')
        } finally {
          await Promise.resolve(harness.client.close())
        }
      },
      { timeout: 30_000 },
    )

    test(
      `surfaces missing replay cursors over ${transportName}`,
      async () => {
        const harness = createHarness(transportName)

        try {
          await runMissingReplayCursorContract(harness)
          expect(harness.stderr.join('')).toBe('')
        } finally {
          await Promise.resolve(harness.client.close())
        }
      },
      { timeout: 30_000 },
    )

    test(
      `treats evicted replay cursors as gone over ${transportName}`,
      async () => {
        const harness = createHarness(transportName, {
          maxReplayEvents: 1,
        })

        try {
          await runExpiredReplayCursorContract(harness)
          expect(harness.stderr.join('')).toBe('')
        } finally {
          await Promise.resolve(harness.client.close())
        }
      },
      { timeout: 30_000 },
    )

    test(
      `routes permission decisions over ${transportName}`,
      async () => {
        const harness = createHarness(transportName, {
          permissionFlow: true,
        })

        try {
          await runPermissionDecisionContract(harness)
          expect(harness.stderr.join('')).toBe('')
        } finally {
          await Promise.resolve(harness.client.close())
        }
      },
      { timeout: 30_000 },
    )

    test(
      `applies abort_active_turns disconnect policy over ${transportName}`,
      async () => {
        const harness = createHarness(transportName, {
          abortOnDisconnectFlow: true,
        })

        try {
          await runDisconnectAbortPolicyContract(harness)
          expect(harness.stderr.join('')).toBe('')
        } finally {
          await Promise.resolve(harness.client.close())
        }
      },
      { timeout: 30_000 },
    )

    test(
      `keeps active turns attached under default detach policy over ${transportName}`,
      async () => {
        const harness = createHarness(transportName)

        try {
          await runDisconnectDetachPolicyContract(harness)
          expect(harness.stderr.join('')).toBe('')
        } finally {
          await Promise.resolve(harness.client.close())
        }
      },
      { timeout: 30_000 },
    )

    test(
      `keeps completed turns replayable and immutable over ${transportName}`,
      async () => {
        const harness = createHarness(transportName, {
          completionFlow: true,
        })

        try {
          await runCompletedTurnReplayContract(harness)
          expect(harness.stderr.join('')).toBe('')
        } finally {
          await Promise.resolve(harness.client.close())
        }
      },
      { timeout: 30_000 },
    )

    test(
      `keeps failed turns replayable and immutable over ${transportName}`,
      async () => {
        const harness = createHarness(transportName, {
          failureFlow: true,
        })

        try {
          await runFailedTurnReplayContract(harness)
          expect(harness.stderr.join('')).toBe('')
        } finally {
          await Promise.resolve(harness.client.close())
        }
      },
      { timeout: 30_000 },
    )

    test(
      `disposes conversations without late terminal turn events over ${transportName}`,
      async () => {
        const harness = createHarness(transportName, {
          lateAbortFlow: true,
        })

        try {
          await runDisposeConversationContract(harness)
          expect(harness.stderr.join('')).toBe('')
        } finally {
          await Promise.resolve(harness.client.close())
        }
      },
      { timeout: 30_000 },
    )

    test(
      `suppresses late executor events after abort over ${transportName}`,
      async () => {
        const harness = createHarness(transportName, {
          lateAbortFlow: true,
        })

        try {
          await runLateAbortSuppressionContract(harness)
          expect(harness.stderr.join('')).toBe('')
        } finally {
          await Promise.resolve(harness.client.close())
        }
      },
      { timeout: 30_000 },
    )

    test(
      `delivers run_turn ack before live events over ${transportName}`,
      async () => {
        const harness = createHarness(transportName, {
          completionFlow: true,
        })

        try {
          await runAckBeforeEventContract(harness)
          expect(harness.stderr.join('')).toBe('')
        } finally {
          await Promise.resolve(harness.client.close())
        }
      },
      { timeout: 30_000 },
    )
  }
})

function createHarness(
  name: 'in-process' | 'stdio',
  options: RuntimeHarnessOptions = {},
): RuntimeHarness {
  const events: KernelRuntimeEnvelopeBase[] = []
  const stderr: string[] = []
  const permissionBroker = options.permissionFlow
    ? new RuntimePermissionBroker()
    : undefined
  const runTurnExecutor = options.permissionFlow
    ? createPermissionFlowExecutor()
    : options.abortOnDisconnectFlow
      ? createAbortOnDisconnectExecutor()
      : options.completionFlow
        ? createCompletionExecutor()
        : options.failureFlow
          ? createFailureExecutor()
          : options.lateAbortFlow
            ? createLateAbortExecutor()
        : undefined
  const transport =
    name === 'in-process'
      ? createKernelRuntimeInProcessWireTransport({
          router: createDefaultKernelRuntimeWireRouter({
            runtimeId: `runtime-${name}`,
            workspacePath: repoRoot,
            headlessExecutor: false,
            maxReplayEvents: options.maxReplayEvents,
            permissionBroker,
            runTurnExecutor,
          }),
        })
      : createKernelRuntimeStdioWireTransport({
          command: 'bun',
          args: createStdioHarnessArgs(options),
          cwd: repoRoot,
          stderr: chunk => stderr.push(chunk),
        })
  let nextRequest = 1
  const client = createKernelRuntimeWireClient(transport, {
    createRequestId: type => `${name}-${type}-${nextRequest++}`,
  })
  client.onEvent(envelope => {
    events.push(envelope)
  })
  return { name, client, events, stderr }
}

async function runTransportContract(harness: RuntimeHarness): Promise<void> {
  const conversationId = `conversation-${harness.name}`
  const turnId = `turn-${harness.name}`
  const host: KernelRuntimeHostIdentity = {
    kind: 'desktop',
    id: `host-${harness.name}`,
    transport: harness.name === 'stdio' ? 'stdio' : 'in-process',
    trustLevel: 'local',
    declaredCapabilities: ['events'],
  }

  const pong = await harness.client.ping()
  expect(pong).toMatchObject({
    kind: 'pong',
    requestId: `${harness.name}-ping-1`,
  })

  const connect = await harness.client.connectHost(host)
  expect(connect).toMatchObject({
    kind: 'ack',
    payload: {
      connected: true,
      hostId: host.id,
      state: 'connected',
    },
  })
  await waitForEvent(harness.events, envelope => {
    return eventType(envelope) === 'host.connected'
  })

  await harness.client.createConversation({
    conversationId,
    workspacePath: repoRoot,
  })
  const ready = await waitForEvent(harness.events, envelope => {
    return eventType(envelope) === 'conversation.ready'
  })
  expect(ready.eventId).toBeDefined()

  await harness.client.runTurn({
    conversationId,
    turnId,
    prompt: `hello ${harness.name}`,
  })
  await waitForEvent(harness.events, envelope => {
    return eventType(envelope) === 'turn.started'
  })

  await harness.client.abortTurn({
    conversationId,
    turnId,
    reason: 'transport_abort',
  })
  await waitForEvent(harness.events, envelope => {
    return eventType(envelope) === 'turn.abort_requested'
  })

  const replayStart = harness.events.length
  await harness.client.subscribeEvents({
    conversationId,
    sinceEventId: ready.eventId,
  })
  await waitForEvent(
    harness.events,
    envelope => eventType(envelope) === 'turn.started',
    replayStart,
  )

  const missingPermission = await harness.client.decidePermission({
    permissionRequestId: `missing-permission-${harness.name}`,
    decision: 'deny',
    decidedBy: 'host',
    reason: 'not pending',
  })
  expect(missingPermission).toMatchObject({
    kind: 'error',
    error: {
      code: 'not_found',
      retryable: false,
    },
  })

  const disconnect = await harness.client.disconnectHost(host.id, {
    policy: 'abort_active_turns',
    reason: 'transport_closed',
  })
  expect(disconnect).toMatchObject({
    kind: 'ack',
    payload: {
      disconnected: true,
      hostId: host.id,
      policy: 'abort_active_turns',
      abortedTurnIds: [turnId],
    },
  })
  await waitForEvent(harness.events, envelope => {
    return eventType(envelope) === 'host.disconnected'
  })
}

async function runAckBeforeEventContract(
  harness: RuntimeHarness,
): Promise<void> {
  const conversationId = `conversation-ack-order-${harness.name}`
  const turnId = `turn-ack-order-${harness.name}`

  await harness.client.subscribeEvents({ conversationId })
  await harness.client.createConversation({
    conversationId,
    workspacePath: repoRoot,
  })
  await waitForEvent(
    harness.events,
    envelope => eventType(envelope) === 'conversation.ready',
  )

  const eventStartIndex = harness.events.length
  const ack = await harness.client.runTurn({
    conversationId,
    turnId,
    prompt: 'ordered delivery',
  })

  expect(ack).toMatchObject({
    kind: 'ack',
    conversationId,
    turnId,
    payload: {
      state: 'running',
    },
  })
  expect(
    harness.events
      .slice(eventStartIndex)
      .some(envelope =>
        ['turn.started', 'turn.completed', 'turn.output_delta'].includes(
          eventType(envelope) ?? '',
        ),
      ),
  ).toBe(false)

  await Promise.resolve()
  await waitForEvent(
    harness.events,
    envelope => eventType(envelope) === 'turn.started',
    eventStartIndex,
  )
  await waitForEvent(
    harness.events,
    envelope => eventType(envelope) === 'turn.completed',
    eventStartIndex,
  )
}

async function runMultiConversationIsolationContract(
  harness: RuntimeHarness,
): Promise<void> {
  const conversationA = `conversation-${harness.name}-a`
  const conversationB = `conversation-${harness.name}-b`
  const turnA = `turn-${harness.name}-a`
  const turnB = `turn-${harness.name}-b`

  await harness.client.createConversation({
    conversationId: conversationA,
    workspacePath: repoRoot,
  })
  await harness.client.createConversation({
    conversationId: conversationB,
    workspacePath: repoRoot,
  })

  await harness.client.runTurn({
    conversationId: conversationA,
    turnId: turnA,
    prompt: `hello ${conversationA}`,
  })
  await harness.client.runTurn({
    conversationId: conversationB,
    turnId: turnB,
    prompt: `hello ${conversationB}`,
  })

  await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'turn.started' &&
      envelope.conversationId === conversationA &&
      envelope.turnId === turnA,
  )
  await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'turn.started' &&
      envelope.conversationId === conversationB &&
      envelope.turnId === turnB,
  )

  const busyBeforeAbort = await harness.client.runTurn({
    conversationId: conversationA,
    turnId: `${turnA}-next`,
    prompt: 'should be busy',
  })
  expect(busyBeforeAbort).toMatchObject({
    kind: 'error',
    conversationId: conversationA,
    turnId: turnA,
    error: {
      code: 'busy',
      retryable: true,
    },
  })

  const beforeAbortBEvents = harness.events.length
  const abortA = await harness.client.abortTurn({
    conversationId: conversationA,
    turnId: turnA,
    reason: 'targeted_abort',
  })
  expect(abortA).toMatchObject({
    kind: 'ack',
    conversationId: conversationA,
    turnId: turnA,
    payload: {
      state: 'aborting',
      stopReason: 'targeted_abort',
    },
  })

  await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'turn.abort_requested' &&
      envelope.conversationId === conversationA &&
      envelope.turnId === turnA,
  )
  expect(
    harness.events
      .slice(beforeAbortBEvents)
      .some(
        envelope =>
          eventType(envelope) === 'turn.abort_requested' &&
          envelope.conversationId === conversationB,
      ),
  ).toBe(false)

  const busyAfterTargetedAbort = await harness.client.runTurn({
    conversationId: conversationB,
    turnId: `${turnB}-next`,
    prompt: 'conversation B should still be busy',
  })
  expect(busyAfterTargetedAbort).toMatchObject({
    kind: 'error',
    conversationId: conversationB,
    turnId: turnB,
    error: {
      code: 'busy',
      retryable: true,
    },
  })

  await harness.client.abortTurn({
    conversationId: conversationB,
    turnId: turnB,
    reason: 'cleanup_abort',
  })
  await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'turn.abort_requested' &&
      envelope.conversationId === conversationB &&
      envelope.turnId === turnB,
  )
}

async function runIdempotentTurnContract(
  harness: RuntimeHarness,
): Promise<void> {
  const conversationId = `conversation-${harness.name}-idempotent`
  const turnId = `turn-${harness.name}-idempotent`

  await harness.client.createConversation({
    conversationId,
    workspacePath: repoRoot,
  })
  await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'conversation.ready' &&
      envelope.conversationId === conversationId,
  )

  const firstRun = await harness.client.runTurn({
    conversationId,
    turnId,
    prompt: `first ${turnId}`,
  })
  const duplicateRun = await harness.client.runTurn({
    conversationId,
    turnId,
    prompt: `duplicate ${turnId}`,
  })

  expect(firstRun).toMatchObject({
    kind: 'ack',
    conversationId,
    turnId,
    payload: {
      state: 'running',
    },
  })
  expect(duplicateRun).toMatchObject({
    kind: 'ack',
    conversationId,
    turnId,
    payload: {
      state: 'running',
    },
  })

  await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'turn.started' &&
      envelope.conversationId === conversationId &&
      envelope.turnId === turnId,
  )

  expect(
    harness.events.filter(
      envelope =>
        eventType(envelope) === 'turn.started' &&
        envelope.conversationId === conversationId &&
        envelope.turnId === turnId,
    ),
  ).toHaveLength(1)

  const firstAbort = await harness.client.abortTurn({
    conversationId,
    turnId,
    reason: 'user_interrupt',
  })
  const duplicateAbort = await harness.client.abortTurn({
    conversationId,
    turnId,
    reason: 'duplicate_interrupt',
  })

  expect(firstAbort).toMatchObject({
    kind: 'ack',
    conversationId,
    turnId,
    payload: {
      state: 'aborting',
      stopReason: 'user_interrupt',
    },
  })
  expect(duplicateAbort).toMatchObject({
    kind: 'ack',
    conversationId,
    turnId,
    payload: {
      state: 'aborting',
      stopReason: 'user_interrupt',
    },
  })

  await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'turn.abort_requested' &&
      envelope.conversationId === conversationId &&
      envelope.turnId === turnId,
  )

  expect(
    harness.events.filter(
      envelope =>
        eventType(envelope) === 'turn.abort_requested' &&
        envelope.conversationId === conversationId &&
        envelope.turnId === turnId,
    ),
  ).toHaveLength(1)
}

async function runHostReconnectCursorContract(
  harness: RuntimeHarness,
): Promise<void> {
  const conversationId = `conversation-${harness.name}-reconnect`
  const turnId = `turn-${harness.name}-reconnect`
  const host: KernelRuntimeHostIdentity = {
    kind: 'desktop',
    id: `host-${harness.name}-reconnect`,
    transport: harness.name === 'stdio' ? 'stdio' : 'in-process',
    trustLevel: 'local',
    declaredCapabilities: ['events'],
  }

  await harness.client.createConversation({
    conversationId,
    workspacePath: repoRoot,
  })
  const ready = await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'conversation.ready' &&
      envelope.conversationId === conversationId,
  )

  await harness.client.runTurn({
    conversationId,
    turnId,
    prompt: `hello ${conversationId}`,
  })
  await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'turn.started' &&
      envelope.conversationId === conversationId &&
      envelope.turnId === turnId,
  )

  const firstConnect = await harness.client.connectHost(host, {
    sinceEventId: ready.eventId,
  })
  expect(firstConnect).toMatchObject({
    kind: 'ack',
    payload: {
      connected: true,
      hostId: host.id,
      state: 'connected',
      replayedEvents: 0,
    },
  })

  await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'host.connected' &&
      envelope.payload &&
      ((envelope.payload as { payload?: { host?: { id?: string } } }).payload
        ?.host?.id === host.id),
  )

  const disconnect = await harness.client.disconnectHost(host.id, {
    reason: 'window_closed',
  })
  expect(disconnect).toMatchObject({
    kind: 'ack',
    payload: {
      disconnected: true,
      hostId: host.id,
      policy: 'detach',
      reason: 'window_closed',
    },
  })

  const hostDisconnected = await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'host.disconnected' &&
      envelope.payload &&
      ((envelope.payload as { payload?: { hostId?: string } }).payload?.hostId ===
        host.id),
  )

  const reconnect = await harness.client.connectHost(host, {
    sinceEventId: hostDisconnected.eventId,
  })
  expect(reconnect).toMatchObject({
    kind: 'ack',
    payload: {
      connected: true,
      hostId: host.id,
      previousState: 'disconnected',
      replayedEvents: 0,
    },
  })

  await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'host.reconnected' &&
      envelope.payload &&
      ((envelope.payload as { payload?: { previousState?: string } }).payload
        ?.previousState === 'disconnected'),
  )
}

async function runMissingReplayCursorContract(
  harness: RuntimeHarness,
): Promise<void> {
  const conversationId = `conversation-${harness.name}-missing-replay`

  await harness.client.createConversation({
    conversationId,
    workspacePath: repoRoot,
  })
  await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'conversation.ready' &&
      envelope.conversationId === conversationId,
  )

  const missingReplay = await harness.client.subscribeEvents({
    conversationId,
    sinceEventId: 'missing-event',
  })

  expect(missingReplay).toMatchObject({
    kind: 'error',
    conversationId,
    error: {
      code: 'not_found',
      retryable: false,
      details: {
        eventId: 'missing-event',
        replayError: 'not_found',
      },
    },
  })
}

async function runExpiredReplayCursorContract(
  harness: RuntimeHarness,
): Promise<void> {
  const conversationId = `conversation-${harness.name}-expired-replay`

  await harness.client.createConversation({
    conversationId,
    workspacePath: repoRoot,
  })
  const ready = await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'conversation.ready' &&
      envelope.conversationId === conversationId,
  )

  await harness.client.runTurn({
    conversationId,
    turnId: `turn-${harness.name}-expired-replay`,
    prompt: `hello ${conversationId}`,
  })
  await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'turn.started' &&
      envelope.conversationId === conversationId,
  )

  const expiredReplay = await harness.client.subscribeEvents({
    conversationId,
    sinceEventId: ready.eventId,
  })

  expect(expiredReplay).toMatchObject({
    kind: 'error',
    conversationId,
    error: {
      code: 'not_found',
      retryable: false,
      details: {
        eventId: ready.eventId,
        replayError: 'not_found',
      },
    },
  })
}

async function runPermissionDecisionContract(
  harness: RuntimeHarness,
): Promise<void> {
  const conversationId = `conversation-${harness.name}-permission`
  const turnId = `turn-${harness.name}-permission`

  await harness.client.createConversation({
    conversationId,
    workspacePath: repoRoot,
  })
  await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'conversation.ready' &&
      envelope.conversationId === conversationId,
  )

  await harness.client.runTurn({
    conversationId,
    turnId,
    prompt: `hello ${conversationId}`,
  })

  const permissionRequested = await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'executor.permission_requested' &&
      envelope.conversationId === conversationId &&
      envelope.turnId === turnId,
  )
  const permissionRequestId = (
    permissionRequested.payload as {
      payload?: { permissionRequestId?: string }
    }
  ).payload?.permissionRequestId

  expect(permissionRequestId).toBe(
    `permission:${conversationId}:${turnId}`,
  )

  const decisionAck = await harness.client.decidePermission({
    permissionRequestId: permissionRequestId!,
    decision: 'allow_once',
    decidedBy: 'host',
    reason: 'approved from transport contract',
  })

  expect(decisionAck).toMatchObject({
    kind: 'ack',
    payload: {
      permissionRequestId,
      decision: 'allow_once',
      decidedBy: 'host',
      reason: 'approved from transport contract',
    },
  })

  const permissionDecision = await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'executor.permission_decision' &&
      envelope.conversationId === conversationId &&
      envelope.turnId === turnId,
  )

  expect(permissionDecision).toMatchObject({
    conversationId,
    turnId,
    payload: {
      type: 'executor.permission_decision',
      payload: {
        permissionRequestId,
        decision: 'allow_once',
        decidedBy: 'host',
      },
    },
  })
}

async function runDisconnectAbortPolicyContract(
  harness: RuntimeHarness,
): Promise<void> {
  const conversationId = `conversation-${harness.name}-disconnect`
  const turnId = `turn-${harness.name}-disconnect`
  const host: KernelRuntimeHostIdentity = {
    kind: 'desktop',
    id: `host-${harness.name}-disconnect`,
    transport: harness.name === 'stdio' ? 'stdio' : 'in-process',
    trustLevel: 'local',
    declaredCapabilities: ['events'],
  }

  await harness.client.connectHost(host)
  await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'host.connected' &&
      ((envelope.payload as { payload?: { host?: { id?: string } } }).payload
        ?.host?.id === host.id),
  )

  await harness.client.createConversation({
    conversationId,
    workspacePath: repoRoot,
  })
  await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'conversation.ready' &&
      envelope.conversationId === conversationId,
  )

  await harness.client.runTurn({
    conversationId,
    turnId,
    prompt: `hello ${conversationId}`,
  })
  await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'turn.started' &&
      envelope.conversationId === conversationId &&
      envelope.turnId === turnId,
  )

  const disconnectAck = await harness.client.disconnectHost(host.id, {
    policy: 'abort_active_turns',
    reason: 'host_closed',
  })

  expect(disconnectAck).toMatchObject({
    kind: 'ack',
    payload: {
      disconnected: true,
      hostId: host.id,
      policy: 'abort_active_turns',
      abortedTurnIds: [turnId],
    },
  })

  const completed = await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'turn.completed' &&
      envelope.conversationId === conversationId &&
      envelope.turnId === turnId,
  )

  expect(completed).toMatchObject({
    conversationId,
    turnId,
    payload: {
      type: 'turn.completed',
      payload: {
        state: 'completed',
        stopReason: 'host_closed',
      },
    },
  })

  const hostDisconnected = await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'host.disconnected' &&
      ((envelope.payload as { payload?: { hostId?: string } }).payload?.hostId ===
        host.id),
  )

  expect(hostDisconnected).toMatchObject({
    payload: {
      type: 'host.disconnected',
      payload: {
        hostId: host.id,
        policy: 'abort_active_turns',
        abortedTurnIds: [turnId],
      },
    },
  })
}

async function runDisconnectDetachPolicyContract(
  harness: RuntimeHarness,
): Promise<void> {
  const conversationId = `conversation-${harness.name}-detach`
  const turnId = `turn-${harness.name}-detach`
  const host: KernelRuntimeHostIdentity = {
    kind: 'desktop',
    id: `host-${harness.name}-detach`,
    transport: harness.name === 'stdio' ? 'stdio' : 'in-process',
    trustLevel: 'local',
    declaredCapabilities: ['events'],
  }

  await harness.client.connectHost(host)
  await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'host.connected' &&
      ((envelope.payload as { payload?: { host?: { id?: string } } }).payload
        ?.host?.id === host.id),
  )

  await harness.client.createConversation({
    conversationId,
    workspacePath: repoRoot,
  })
  await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'conversation.ready' &&
      envelope.conversationId === conversationId,
  )

  await harness.client.runTurn({
    conversationId,
    turnId,
    prompt: `hello ${conversationId}`,
  })
  await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'turn.started' &&
      envelope.conversationId === conversationId &&
      envelope.turnId === turnId,
  )

  const disconnectAck = await harness.client.disconnectHost(host.id, {
    reason: 'window_closed',
  })

  expect(disconnectAck).toMatchObject({
    kind: 'ack',
    payload: {
      disconnected: true,
      hostId: host.id,
      policy: 'detach',
      reason: 'window_closed',
    },
  })

  const hostDisconnected = await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'host.disconnected' &&
      ((envelope.payload as { payload?: { hostId?: string } }).payload?.hostId ===
        host.id),
  )

  expect(hostDisconnected).toMatchObject({
    payload: {
      type: 'host.disconnected',
      payload: {
        hostId: host.id,
        policy: 'detach',
        reason: 'window_closed',
      },
    },
  })

  expect(
    (hostDisconnected.payload as { payload?: { abortedTurnIds?: string[] } })
      .payload?.abortedTurnIds,
  ).toEqual([])

  const stillBusy = await harness.client.runTurn({
    conversationId,
    turnId: `${turnId}-next`,
    prompt: 'still busy after detach',
  })

  expect(stillBusy).toMatchObject({
    kind: 'error',
    conversationId,
    turnId,
    error: {
      code: 'busy',
      retryable: true,
    },
  })
}

async function runCompletedTurnReplayContract(
  harness: RuntimeHarness,
): Promise<void> {
  const conversationId = `conversation-${harness.name}-completed-replay`
  const turnId = `turn-${harness.name}-completed-replay`

  await harness.client.createConversation({
    conversationId,
    workspacePath: repoRoot,
  })
  await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'conversation.ready' &&
      envelope.conversationId === conversationId,
  )

  const runAck = await harness.client.runTurn({
    conversationId,
    turnId,
    prompt: `hello ${conversationId}`,
  })
  expect(runAck).toMatchObject({
    kind: 'ack',
    conversationId,
    turnId,
    payload: {
      state: 'running',
    },
  })

  const started = await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'turn.started' &&
      envelope.conversationId === conversationId &&
      envelope.turnId === turnId,
  )
  const completed = await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'turn.completed' &&
      envelope.conversationId === conversationId &&
      envelope.turnId === turnId,
  )

  expect(completed).toMatchObject({
    conversationId,
    turnId,
    payload: {
      type: 'turn.completed',
      payload: {
        state: 'completed',
        stopReason: 'end_turn',
      },
    },
  })

  const replayStart = harness.events.length
  const replayAck = await harness.client.subscribeEvents({
    conversationId,
    turnId,
    sinceEventId: started.eventId,
  })
  expect(replayAck).toMatchObject({
    kind: 'ack',
    conversationId,
    turnId,
    payload: {
      subscribed: true,
    },
  })

  await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'turn.completed' &&
      envelope.conversationId === conversationId &&
      envelope.turnId === turnId,
    replayStart,
  )
  expect(
    harness.events.filter(
      envelope =>
        eventType(envelope) === 'turn.completed' &&
        envelope.conversationId === conversationId &&
        envelope.turnId === turnId,
    ),
  ).toHaveLength(2)
  expect(
    harness.events
      .slice(replayStart)
      .some(
        envelope =>
          eventType(envelope) === 'turn.started' &&
          envelope.conversationId === conversationId &&
          envelope.turnId === turnId,
      ),
  ).toBe(false)

  const abortStart = harness.events.length
  const abortAck = await harness.client.abortTurn({
    conversationId,
    turnId,
    reason: 'too_late',
  })
  expect(abortAck).toMatchObject({
    kind: 'ack',
    conversationId,
    turnId,
    payload: {
      state: 'completed',
      stopReason: 'end_turn',
    },
  })
  await assertNoMatchingEvents(
    harness.events,
    envelope =>
      eventType(envelope) === 'turn.abort_requested' &&
      envelope.conversationId === conversationId &&
      envelope.turnId === turnId,
    abortStart,
  )

  const rerunStart = harness.events.length
  const rerunAck = await harness.client.runTurn({
    conversationId,
    turnId,
    prompt: 'should stay completed',
  })
  expect(rerunAck).toMatchObject({
    kind: 'ack',
    conversationId,
    turnId,
    payload: {
      state: 'completed',
      stopReason: 'end_turn',
    },
  })
  await assertNoMatchingEvents(
    harness.events,
    envelope =>
      (eventType(envelope) === 'turn.started' ||
        eventType(envelope) === 'turn.completed') &&
      envelope.conversationId === conversationId &&
      envelope.turnId === turnId,
    rerunStart,
  )
}

async function runFailedTurnReplayContract(
  harness: RuntimeHarness,
): Promise<void> {
  const conversationId = `conversation-${harness.name}-failed-replay`
  const turnId = `turn-${harness.name}-failed-replay`

  await harness.client.createConversation({
    conversationId,
    workspacePath: repoRoot,
  })
  await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'conversation.ready' &&
      envelope.conversationId === conversationId,
  )

  const runAck = await harness.client.runTurn({
    conversationId,
    turnId,
    prompt: `hello ${conversationId}`,
  })
  expect(runAck).toMatchObject({
    kind: 'ack',
    conversationId,
    turnId,
    payload: {
      state: 'running',
    },
  })

  const started = await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'turn.started' &&
      envelope.conversationId === conversationId &&
      envelope.turnId === turnId,
  )
  const failed = await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'turn.failed' &&
      envelope.conversationId === conversationId &&
      envelope.turnId === turnId,
  )

  expect(failed).toMatchObject({
    conversationId,
    turnId,
    payload: {
      type: 'turn.failed',
      payload: {
        state: 'failed',
        error: {
          name: 'Error',
          message: 'executor_failed',
        },
      },
    },
  })

  const replayStart = harness.events.length
  const replayAck = await harness.client.subscribeEvents({
    conversationId,
    turnId,
    sinceEventId: started.eventId,
  })
  expect(replayAck).toMatchObject({
    kind: 'ack',
    conversationId,
    turnId,
    payload: {
      subscribed: true,
    },
  })

  await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'turn.failed' &&
      envelope.conversationId === conversationId &&
      envelope.turnId === turnId,
    replayStart,
  )
  expect(
    harness.events.filter(
      envelope =>
        eventType(envelope) === 'turn.failed' &&
        envelope.conversationId === conversationId &&
        envelope.turnId === turnId,
    ),
  ).toHaveLength(2)
  expect(
    harness.events
      .slice(replayStart)
      .some(
        envelope =>
          eventType(envelope) === 'turn.started' &&
          envelope.conversationId === conversationId &&
          envelope.turnId === turnId,
      ),
  ).toBe(false)

  const abortStart = harness.events.length
  const abortAck = await harness.client.abortTurn({
    conversationId,
    turnId,
    reason: 'too_late',
  })
  expect(abortAck).toMatchObject({
    kind: 'ack',
    conversationId,
    turnId,
    payload: {
      state: 'failed',
      error: {
        name: 'Error',
        message: 'executor_failed',
      },
    },
  })
  await assertNoMatchingEvents(
    harness.events,
    envelope =>
      eventType(envelope) === 'turn.abort_requested' &&
      envelope.conversationId === conversationId &&
      envelope.turnId === turnId,
    abortStart,
  )

  const rerunStart = harness.events.length
  const rerunAck = await harness.client.runTurn({
    conversationId,
    turnId,
    prompt: 'should stay failed',
  })
  expect(rerunAck).toMatchObject({
    kind: 'ack',
    conversationId,
    turnId,
    payload: {
      state: 'failed',
      error: {
        name: 'Error',
        message: 'executor_failed',
      },
    },
  })
  await assertNoMatchingEvents(
    harness.events,
    envelope =>
      (eventType(envelope) === 'turn.started' ||
        eventType(envelope) === 'turn.failed') &&
      envelope.conversationId === conversationId &&
      envelope.turnId === turnId,
    rerunStart,
  )
}

async function runDisposeConversationContract(
  harness: RuntimeHarness,
): Promise<void> {
  const conversationId = `conversation-${harness.name}-dispose`
  const turnId = `turn-${harness.name}-dispose`

  await harness.client.createConversation({
    conversationId,
    workspacePath: repoRoot,
  })
  await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'conversation.ready' &&
      envelope.conversationId === conversationId,
  )

  const runAck = await harness.client.runTurn({
    conversationId,
    turnId,
    prompt: `hello ${conversationId}`,
  })
  expect(runAck).toMatchObject({
    kind: 'ack',
    conversationId,
    turnId,
    payload: {
      state: 'running',
    },
  })

  const started = await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'turn.started' &&
      envelope.conversationId === conversationId &&
      envelope.turnId === turnId,
  )

  const disposeStart = harness.events.length
  const disposeAck = await harness.client.request<KernelRuntimeDisposeConversationCommand>(
    {
      type: 'dispose_conversation',
      conversationId,
      reason: 'manual_dispose',
    },
  )
  expect(disposeAck).toMatchObject({
    kind: 'ack',
    conversationId,
    payload: {
      disposed: true,
    },
  })

  const disposed = await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'conversation.disposed' &&
      envelope.conversationId === conversationId,
    disposeStart,
  )
  expect(disposed).toMatchObject({
    conversationId,
    payload: {
      type: 'conversation.disposed',
      payload: {
        reason: 'manual_dispose',
      },
    },
  })

  await assertNoMatchingEvents(
    harness.events,
    envelope =>
      eventType(envelope) === 'turn.output_delta' &&
      envelope.conversationId === conversationId &&
      envelope.turnId === turnId,
    disposeStart,
  )

  await assertNoMatchingEvents(
    harness.events,
    envelope =>
      (eventType(envelope) === 'turn.completed' ||
        eventType(envelope) === 'turn.failed') &&
      envelope.conversationId === conversationId &&
      envelope.turnId === turnId,
    disposeStart,
  )

  const replayStart = harness.events.length
  const replayAck = await harness.client.subscribeEvents({
    conversationId,
    sinceEventId: started.eventId,
  })
  expect(replayAck).toMatchObject({
    kind: 'ack',
    conversationId,
    payload: {
      subscribed: true,
    },
  })
  await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'conversation.disposed' &&
      envelope.conversationId === conversationId,
    replayStart,
  )
  expect(
    harness.events
      .slice(replayStart)
      .some(
        envelope =>
          (eventType(envelope) === 'turn.completed' ||
            eventType(envelope) === 'turn.failed') &&
          envelope.conversationId === conversationId &&
          envelope.turnId === turnId,
      ),
  ).toBe(false)

  const rerun = await harness.client.runTurn({
    conversationId,
    turnId: `${turnId}-next`,
    prompt: 'should fail after dispose',
  })
  expect(rerun).toMatchObject({
    kind: 'error',
    conversationId,
    error: {
      code: 'not_found',
      retryable: false,
    },
  })

  const abortAfterDispose = await harness.client.abortTurn({
    conversationId,
    turnId,
    reason: 'too_late',
  })
  expect(abortAfterDispose).toMatchObject({
    kind: 'error',
    conversationId,
    error: {
      code: 'not_found',
      retryable: false,
    },
  })
}

async function runLateAbortSuppressionContract(
  harness: RuntimeHarness,
): Promise<void> {
  const conversationId = `conversation-${harness.name}-late-abort`
  const turnId = `turn-${harness.name}-late-abort`

  await harness.client.createConversation({
    conversationId,
    workspacePath: repoRoot,
  })
  await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'conversation.ready' &&
      envelope.conversationId === conversationId,
  )

  await harness.client.runTurn({
    conversationId,
    turnId,
    prompt: `hello ${conversationId}`,
  })
  await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'turn.started' &&
      envelope.conversationId === conversationId &&
      envelope.turnId === turnId,
  )

  const abortStart = harness.events.length
  const abortAck = await harness.client.abortTurn({
    conversationId,
    turnId,
    reason: 'user_abort',
  })
  expect(abortAck).toMatchObject({
    kind: 'ack',
    conversationId,
    turnId,
    payload: {
      state: 'aborting',
      stopReason: 'user_abort',
    },
  })

  const completed = await waitForEvent(
    harness.events,
    envelope =>
      eventType(envelope) === 'turn.completed' &&
      envelope.conversationId === conversationId &&
      envelope.turnId === turnId,
    abortStart,
  )
  expect(completed).toMatchObject({
    conversationId,
    turnId,
    payload: {
      type: 'turn.completed',
      payload: {
        state: 'completed',
        stopReason: 'user_abort',
      },
    },
  })

  await assertNoMatchingEvents(
    harness.events,
    envelope =>
      eventType(envelope) === 'turn.output_delta' &&
      envelope.conversationId === conversationId &&
      envelope.turnId === turnId,
    abortStart,
  )

  expect(
    harness.events
      .slice(abortStart)
      .filter(
        envelope =>
          eventType(envelope) === 'turn.completed' &&
          envelope.conversationId === conversationId &&
          envelope.turnId === turnId,
      ),
  ).toHaveLength(1)
  expect(
    (
      completed.payload as {
        payload?: { stopReason?: string }
      }
    ).payload?.stopReason,
  ).toBe('user_abort')
}

function createPermissionFlowExecutor() {
  return async function* permissionFlowExecutor(context: {
    command: { conversationId: string; turnId: string }
    permissionBroker?: RuntimePermissionBroker
  }) {
    const permissionRequestId = `permission:${context.command.conversationId}:${context.command.turnId}`
    yield {
      type: 'event' as const,
      event: {
        type: 'executor.permission_requested',
        replayable: true,
        payload: { permissionRequestId },
      },
    }
    const decision = await context.permissionBroker!.requestPermission({
      permissionRequestId,
      conversationId: context.command.conversationId,
      turnId: context.command.turnId,
      toolName: 'Bash',
      action: 'run',
      argumentsPreview: { command: 'pwd' },
      risk: 'medium',
      policySnapshot: { mode: 'default' },
    })
    yield {
      type: 'event' as const,
      event: {
        type: 'executor.permission_decision',
        replayable: true,
        payload: decision,
      },
    }
    yield {
      type: 'completed' as const,
      stopReason: 'end_turn',
    }
  }
}

function createAbortOnDisconnectExecutor() {
  return async function* abortOnDisconnectExecutor(context: {
    signal: AbortSignal
  }) {
    await new Promise((_resolve, reject) => {
      context.signal.addEventListener(
        'abort',
        () => reject(context.signal.reason ?? new Error('aborted')),
        { once: true },
      )
    })
  }
}

function createCompletionExecutor() {
  return async function* completionExecutor() {
    yield {
      type: 'completed' as const,
      stopReason: 'end_turn',
    }
  }
}

function createFailureExecutor() {
  return async function* failureExecutor() {
    throw new Error('executor_failed')
  }
}

function createLateAbortExecutor() {
  return async function* lateAbortExecutor(context: {
    signal: AbortSignal
  }) {
    await new Promise<void>(resolve => {
      context.signal.addEventListener('abort', () => resolve(), {
        once: true,
      })
    })
    yield {
      type: 'output' as const,
      payload: {
        text: 'late after abort',
      },
    }
    yield {
      type: 'completed' as const,
      stopReason: 'late_completion_should_be_ignored',
    }
  }
}

function createStdioHarnessArgs(options: RuntimeHarnessOptions): string[] {
  if (
    options.maxReplayEvents === undefined &&
    options.permissionFlow !== true &&
    options.abortOnDisconnectFlow !== true &&
    options.completionFlow !== true &&
    options.failureFlow !== true &&
    options.lateAbortFlow !== true
  ) {
    return ['run', 'src/entrypoints/kernel-runtime.ts']
  }

  const lines = [
    "const { runKernelRuntimeWireProtocol } = await import('./src/kernel/wireProtocol.ts')",
  ]

  if (options.permissionFlow) {
    lines.push(
      "const { RuntimePermissionBroker } = await import('./src/runtime/capabilities/permissions/RuntimePermissionBroker.ts')",
      'const permissionBroker = new RuntimePermissionBroker()',
      "const runTurnExecutor = async function* (context) {",
      "  const permissionRequestId = `permission:${context.command.conversationId}:${context.command.turnId}`",
      "  yield { type: 'event', event: { type: 'executor.permission_requested', replayable: true, payload: { permissionRequestId } } }",
      "  const decision = await context.permissionBroker.requestPermission({ permissionRequestId, conversationId: context.command.conversationId, turnId: context.command.turnId, toolName: 'Bash', action: 'run', argumentsPreview: { command: 'pwd' }, risk: 'medium', policySnapshot: { mode: 'default' } })",
      "  yield { type: 'event', event: { type: 'executor.permission_decision', replayable: true, payload: decision } }",
      "  yield { type: 'completed', stopReason: 'end_turn' }",
      '}',
    )
  }
  if (options.abortOnDisconnectFlow) {
    lines.push(
      "const runTurnExecutor = async function* (context) {",
      "  await new Promise((_resolve, reject) => {",
      "    context.signal.addEventListener('abort', () => reject(context.signal.reason ?? new Error('aborted')), { once: true })",
      '  })',
      '}',
    )
  }
  if (options.completionFlow) {
    lines.push(
      "const runTurnExecutor = async function* () {",
      "  yield { type: 'completed', stopReason: 'end_turn' }",
      '}',
    )
  }
  if (options.failureFlow) {
    lines.push(
      "const runTurnExecutor = async function* () {",
      "  throw new Error('executor_failed')",
      '}',
    )
  }
  if (options.lateAbortFlow) {
    lines.push(
      "const runTurnExecutor = async function* (context) {",
      "  await new Promise(resolve => context.signal.addEventListener('abort', resolve, { once: true }))",
      "  yield { type: 'output', payload: { text: 'late after abort' } }",
      "  yield { type: 'completed', stopReason: 'late_completion_should_be_ignored' }",
      '}',
    )
  }

  const optionParts = [
    `workspacePath: ${JSON.stringify(repoRoot)}`,
    'headlessExecutor: false',
  ]
  if (options.maxReplayEvents !== undefined) {
    optionParts.push(`maxReplayEvents: ${options.maxReplayEvents}`)
  }
  if (options.permissionFlow) {
    optionParts.push('permissionBroker', 'runTurnExecutor')
  } else if (
    options.abortOnDisconnectFlow ||
    options.completionFlow ||
    options.failureFlow ||
    options.lateAbortFlow
  ) {
    optionParts.push('runTurnExecutor')
  }

  lines.push(
    `await runKernelRuntimeWireProtocol({ ${optionParts.join(', ')} })`,
  )
  return ['-e', lines.join('; ')]
}

async function waitForEvent(
  events: readonly KernelRuntimeEnvelopeBase[],
  predicate: (envelope: KernelRuntimeEnvelopeBase) => boolean,
  startIndex = 0,
): Promise<KernelRuntimeEnvelopeBase> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const event = events.slice(startIndex).find(predicate)
    if (event) {
      return event
    }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('Timed out waiting for kernel runtime event')
}

async function assertNoMatchingEvents(
  events: readonly KernelRuntimeEnvelopeBase[],
  predicate: (envelope: KernelRuntimeEnvelopeBase) => boolean,
  startIndex = 0,
  waitMs = 100,
): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, waitMs))
  expect(events.slice(startIndex).some(predicate)).toBe(false)
}

function eventType(envelope: KernelRuntimeEnvelopeBase): string | undefined {
  return (envelope.payload as { type?: string } | undefined)?.type
}
