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

const repoRoot = join(import.meta.dir, '../..')

type RuntimeHarness = {
  name: string
  client: KernelRuntimeWireClient
  events: KernelRuntimeEnvelopeBase[]
  stderr: string[]
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
  }
})

function createHarness(name: 'in-process' | 'stdio'): RuntimeHarness {
  const events: KernelRuntimeEnvelopeBase[] = []
  const stderr: string[] = []
  const transport =
    name === 'in-process'
      ? createKernelRuntimeInProcessWireTransport({
          router: createDefaultKernelRuntimeWireRouter({
            runtimeId: `runtime-${name}`,
            workspacePath: repoRoot,
            headlessExecutor: false,
          }),
        })
      : createKernelRuntimeStdioWireTransport({
          command: 'bun',
          args: ['run', 'src/entrypoints/kernel-runtime.ts'],
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

function eventType(envelope: KernelRuntimeEnvelopeBase): string | undefined {
  return (envelope.payload as { type?: string } | undefined)?.type
}
