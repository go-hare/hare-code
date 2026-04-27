import { describe, expect, test } from 'bun:test'
import { existsSync } from 'fs'

import { createHeadlessConversation } from '../../../capabilities/execution/internal/headlessConversationAdapter.js'
import { RuntimePermissionBroker } from '../../../capabilities/permissions/RuntimePermissionBroker.js'
import { createRuntimeCapabilityResolver } from '../../../capabilities/RuntimeCapabilityResolver.js'
import type { KernelPermissionRequest } from '../../../contracts/permissions.js'
import { RuntimeEventBus } from '../../events/RuntimeEventBus.js'
import { createKernelRuntimeHeadlessProcessExecutor } from '../KernelRuntimeHeadlessProcessExecutor.js'
import {
  createKernelRuntimeWireRouter,
  type KernelRuntimeWireConversationRecoverySnapshot,
  type KernelRuntimeWireConversationSnapshotStore,
  type KernelRuntimeWireCapabilityResolver,
  type KernelRuntimeWirePermissionBroker,
  type KernelRuntimeWireTurnExecutor,
} from '../KernelRuntimeWireRouter.js'
import { KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION } from '../../../contracts/wire.js'
import {
  parseKernelRuntimeCommandLine,
  serializeKernelRuntimeEnvelope,
} from '../KernelRuntimeWireCodec.js'

function createClock(): () => string {
  let tick = 0
  return () => {
    const second = String(tick++).padStart(2, '0')
    return `2026-04-26T00:00:${second}.000Z`
  }
}

function createMessageIds(): () => string {
  let nextId = 1
  return () => `wire-message-${nextId++}`
}

function createRouter(
  options: {
    capabilityResolver?: KernelRuntimeWireCapabilityResolver
    conversationSnapshotStore?: KernelRuntimeWireConversationSnapshotStore
    maxReplayEvents?: number
    permissionBroker?: KernelRuntimeWirePermissionBroker
    runTurnExecutor?: KernelRuntimeWireTurnExecutor
  } = {},
) {
  const observed: unknown[] = []
  const eventBus = new RuntimeEventBus({
    runtimeId: 'runtime-1',
    maxReplayEvents: options.maxReplayEvents,
    now: createClock(),
    createMessageId: createMessageIds(),
  })
  eventBus.subscribe(envelope => {
    observed.push(envelope)
  })
  const router = createKernelRuntimeWireRouter({
    runtimeId: 'runtime-1',
    workspacePath: '/tmp/workspace',
    eventBus,
    conversationSnapshotStore: options.conversationSnapshotStore,
    capabilityResolver: options.capabilityResolver,
    permissionBroker: options.permissionBroker,
    runTurnExecutor: options.runTurnExecutor,
    createConversation: options => createHeadlessConversation(options),
  })
  return { router, observed }
}

async function waitForObserved<T>(
  observed: readonly T[],
  predicate: (item: T) => boolean,
): Promise<T> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const item = observed.find(predicate)
    if (item) {
      return item
    }
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error('Timed out waiting for observed runtime envelope')
}

async function waitForPendingPermission(
  permissionBroker: RuntimePermissionBroker,
  permissionRequestId: string,
): Promise<void> {
  const deadline = Date.now() + 1_000
  while (Date.now() < deadline) {
    if (
      permissionBroker
        .snapshot()
        .pendingRequestIds.includes(permissionRequestId)
    ) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error('Timed out waiting for pending permission request')
}

function createDeferred(): {
  promise: Promise<void>
  resolve(): void
} {
  let resolve!: () => void
  const promise = new Promise<void>(next => {
    resolve = next
  })
  return { promise, resolve }
}

function createPermissionRequest(
  permissionRequestId: string,
  overrides: Partial<KernelPermissionRequest> = {},
): KernelPermissionRequest {
  return {
    permissionRequestId,
    conversationId: 'conversation-1',
    turnId: 'turn-1',
    toolName: 'Bash',
    action: 'run',
    argumentsPreview: { command: 'pwd' },
    risk: 'medium',
    policySnapshot: { mode: 'default' },
    ...overrides,
  }
}

const testHost = {
  kind: 'desktop',
  id: 'desktop-host-1',
  transport: 'stdio',
  trustLevel: 'local',
  declaredCapabilities: ['events'],
} as const

describe('KernelRuntimeWireRouter', () => {
  test('responds to ping with a stable pong envelope', async () => {
    const { router } = createRouter()

    const [pong] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'ping',
      requestId: 'request-1',
    })

    expect(pong).toMatchObject({
      schemaVersion: 'kernel.runtime.v1',
      kind: 'pong',
      requestId: 'request-1',
      runtimeId: 'runtime-1',
      source: 'kernel_runtime',
    })
  })

  test('routes create, run, abort, and replay through shared runtime events', async () => {
    const { router, observed } = createRouter()

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })
    const [runAck] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'hello',
    })
    const [abortAck] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'abort_turn',
      requestId: 'abort-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      reason: 'interrupt',
    })
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'abort_turn',
      requestId: 'abort-2',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      reason: 'duplicate_interrupt',
    })
    const replay = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'subscribe_events',
      requestId: 'subscribe-1',
      conversationId: 'conversation-1',
    })

    expect(runAck).toMatchObject({
      kind: 'ack',
      requestId: 'run-1',
      payload: { state: 'running' },
    })
    expect(abortAck).toMatchObject({
      kind: 'ack',
      requestId: 'abort-1',
      payload: { state: 'aborting', stopReason: 'interrupt' },
    })
    expect(
      observed.filter(
        envelope =>
          (envelope as { payload?: { type?: string } }).payload?.type ===
          'turn.abort_requested',
      ),
    ).toHaveLength(1)
    expect(
      replay
        .filter(envelope => envelope.kind === 'event')
        .map(envelope => envelope.payload)
        .map(payload => (payload as { type?: string }).type),
    ).toEqual(['conversation.ready', 'turn.started', 'turn.abort_requested'])
  })

  test('replays only events after a scoped cursor', async () => {
    const { router } = createRouter()

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'hello',
    })
    const replay = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'subscribe_events',
      requestId: 'subscribe-1',
      conversationId: 'conversation-1',
    })
    const firstEvent = replay.find(envelope => envelope.kind === 'event')

    expect(firstEvent?.eventId).toBe('conversation-1:1')

    const replayAfterCursor = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'subscribe_events',
      requestId: 'subscribe-2',
      conversationId: 'conversation-1',
      sinceEventId: firstEvent?.eventId,
    })

    expect(
      replayAfterCursor
        .filter(envelope => envelope.kind === 'event')
        .map(envelope => envelope.payload)
        .map(payload => (payload as { type?: string }).type),
    ).toEqual(['turn.started'])
  })

  test('tracks host connect, disconnect, and reconnect replay cursors', async () => {
    const { router, observed } = createRouter()

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'hello',
    })
    const firstEvent = observed.find(
      envelope =>
        (envelope as { payload?: { type?: string } }).payload?.type ===
        'conversation.ready',
    ) as { eventId?: string } | undefined

    const connect = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'connect_host',
      requestId: 'connect-1',
      host: testHost,
      sinceEventId: firstEvent?.eventId,
    })
    const hostConnected = await waitForObserved(observed, envelope => {
      return (
        (envelope as { payload?: { type?: string } }).payload?.type ===
        'host.connected'
      )
    })

    expect(connect[0]).toMatchObject({
      kind: 'ack',
      requestId: 'connect-1',
      payload: {
        connected: true,
        hostId: 'desktop-host-1',
        state: 'connected',
        replayedEvents: 0,
      },
    })
    expect(
      connect
        .filter(envelope => envelope.kind === 'event')
        .map(envelope => (envelope.payload as { type?: string }).type),
    ).toEqual([])
    expect(hostConnected).toMatchObject({
      kind: 'event',
      payload: {
        type: 'host.connected',
        payload: {
          host: testHost,
          replayedEvents: 0,
        },
      },
    })

    const [disconnect] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'disconnect_host',
      requestId: 'disconnect-1',
      hostId: 'desktop-host-1',
      reason: 'window_closed',
    })
    const hostDisconnected = await waitForObserved(observed, envelope => {
      return (
        (envelope as { payload?: { type?: string } }).payload?.type ===
        'host.disconnected'
      )
    })

    expect(disconnect).toMatchObject({
      kind: 'ack',
      requestId: 'disconnect-1',
      payload: {
        disconnected: true,
        hostId: 'desktop-host-1',
        policy: 'detach',
        reason: 'window_closed',
      },
    })

    const reconnect = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'connect_host',
      requestId: 'connect-2',
      host: testHost,
      sinceEventId: (hostDisconnected as { eventId?: string }).eventId,
    })
    const hostReconnected = await waitForObserved(observed, envelope => {
      return (
        (envelope as { payload?: { type?: string } }).payload?.type ===
        'host.reconnected'
      )
    })

    expect(reconnect[0]).toMatchObject({
      kind: 'ack',
      requestId: 'connect-2',
      payload: {
        connected: true,
        hostId: 'desktop-host-1',
        previousState: 'disconnected',
        replayedEvents: 0,
      },
    })
    expect(hostReconnected).toMatchObject({
      payload: {
        type: 'host.reconnected',
        payload: {
          previousState: 'disconnected',
        },
      },
    })
  })

  test('rejects conversation reuse across different sessions', async () => {
    const { router } = createRouter()

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
      sessionId: 'session-a',
    })

    const [conflict] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-2',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
      sessionId: 'session-b',
    })

    expect(conflict).toMatchObject({
      kind: 'error',
      requestId: 'create-2',
      conversationId: 'conversation-1',
      error: {
        code: 'invalid_request',
        retryable: false,
        details: {
          existingSessionId: 'session-a',
          requestedSessionId: 'session-b',
        },
      },
    })
  })

  test('aborts active turns when host disconnect policy requests it', async () => {
    let executionSignal: AbortSignal | undefined
    const { router, observed } = createRouter({
      runTurnExecutor: async function* ({ signal }) {
        executionSignal = signal
        await new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(signal.reason ?? new Error('aborted')),
            { once: true },
          )
        })
      },
    })

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'connect_host',
      requestId: 'connect-1',
      host: testHost,
    })
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'hello',
    })
    await waitForObserved(observed, () => executionSignal !== undefined)

    const [disconnect] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'disconnect_host',
      requestId: 'disconnect-1',
      hostId: 'desktop-host-1',
      policy: 'abort_active_turns',
      reason: 'host_closed',
    })
    const completed = await waitForObserved(observed, envelope => {
      return (
        (envelope as { payload?: { type?: string } }).payload?.type ===
        'turn.completed'
      )
    })

    expect(executionSignal?.aborted).toBe(true)
    expect(disconnect).toMatchObject({
      kind: 'ack',
      payload: {
        disconnected: true,
        hostId: 'desktop-host-1',
        policy: 'abort_active_turns',
        abortedTurnIds: ['turn-1'],
      },
    })
    expect(completed).toMatchObject({
      payload: {
        type: 'turn.completed',
        payload: {
          state: 'completed',
          stopReason: 'host_closed',
        },
      },
    })
  })

  test('rejects missing replay cursors without acknowledging subscription', async () => {
    const { router, observed } = createRouter()
    const observedBeforeSubscribe = observed.length

    const [error] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'subscribe_events',
      requestId: 'subscribe-missing',
      conversationId: 'conversation-1',
      sinceEventId: 'missing-event',
    })

    expect(error).toMatchObject({
      kind: 'error',
      requestId: 'subscribe-missing',
      conversationId: 'conversation-1',
      error: {
        code: 'not_found',
        retryable: false,
        details: {
          eventId: 'missing-event',
          replayError: 'not_found',
        },
      },
    })
    expect(observed.slice(observedBeforeSubscribe)).toEqual([error])
  })

  test('returns retryable gap errors when replay cursors have expired', async () => {
    const { router, observed } = createRouter({ maxReplayEvents: 1 })

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })
    const firstEvent = observed.find(
      envelope =>
        (envelope as { payload?: { type?: string } }).payload?.type ===
        'conversation.ready',
    ) as { eventId?: string } | undefined
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'hello',
    })
    const observedBeforeSubscribe = observed.length

    expect(firstEvent?.eventId).toBe('conversation-1:1')

    const [error] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'subscribe_events',
      requestId: 'subscribe-expired',
      conversationId: 'conversation-1',
      sinceEventId: firstEvent?.eventId,
    })

    expect(error).toMatchObject({
      kind: 'error',
      requestId: 'subscribe-expired',
      conversationId: 'conversation-1',
      error: {
        code: 'unavailable',
        retryable: true,
        details: {
          eventId: 'conversation-1:1',
          replayError: 'expired',
        },
      },
    })
    expect(observed.slice(observedBeforeSubscribe)).toEqual([error])
  })

  test('streams long-running turn output before terminal completion', async () => {
    const releaseExecution = createDeferred()
    const { router, observed } = createRouter({
      runTurnExecutor: async function* () {
        await releaseExecution.promise
        yield {
          type: 'output',
          payload: { text: 'hello from executor' },
        }
        yield {
          type: 'completed',
          stopReason: 'end_turn',
        }
      },
    })

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })
    const [runAck] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'hello',
    })

    expect(runAck).toMatchObject({
      kind: 'ack',
      requestId: 'run-1',
      payload: { state: 'running' },
    })
    expect(
      observed.some(
        envelope =>
          (envelope as { payload?: { type?: string } }).payload?.type ===
          'turn.output_delta',
      ),
    ).toBe(false)

    releaseExecution.resolve()

    const output = await waitForObserved(observed, envelope => {
      return (
        (envelope as { payload?: { type?: string } }).payload?.type ===
        'turn.output_delta'
      )
    })
    const completed = await waitForObserved(observed, envelope => {
      return (
        (envelope as { payload?: { type?: string } }).payload?.type ===
        'turn.completed'
      )
    })

    expect(output).toMatchObject({
      kind: 'event',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      payload: {
        type: 'turn.output_delta',
        payload: { text: 'hello from executor' },
      },
    })
    expect(completed).toMatchObject({
      kind: 'event',
      payload: {
        type: 'turn.completed',
        payload: {
          state: 'completed',
          stopReason: 'end_turn',
        },
      },
    })
  })

  test('streams output from a process-backed headless executor', async () => {
    const fakeHeadlessScript = `
      let input = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", chunk => {
        input += chunk;
      });
      process.stdin.on("end", () => {
        const text = input.trim();
        console.log(JSON.stringify({
          type: "assistant",
          uuid: "assistant-1",
          session_id: "session-1",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "echo:" + text }],
          },
        }));
        console.log(JSON.stringify({
          type: "result",
          subtype: "success",
          is_error: false,
          result: "final:" + text,
          session_id: "session-1",
        }));
      });
    `
    const nodeCommand = existsSync('/usr/local/bin/node')
      ? '/usr/local/bin/node'
      : 'node'
    const { router, observed } = createRouter({
      runTurnExecutor: createKernelRuntimeHeadlessProcessExecutor({
        command: nodeCommand,
        args: ['-e', fakeHeadlessScript],
        cwd: process.cwd(),
        killTimeoutMs: 1000,
      }),
    })

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'hello process',
    })

    const sdkMessage = await waitForObserved(observed, envelope => {
      return (
        (envelope as { payload?: { type?: string } }).payload?.type ===
        'headless.sdk_message'
      )
    })
    const output = await waitForObserved(observed, envelope => {
      return (
        (envelope as { payload?: { type?: string } }).payload?.type ===
          'turn.output_delta' &&
        (envelope as { payload?: { payload?: { text?: string } } }).payload
          ?.payload?.text === 'final:hello process'
      )
    })
    const completed = await waitForObserved(observed, envelope => {
      return (
        (envelope as { payload?: { type?: string } }).payload?.type ===
        'turn.completed'
      )
    })

    expect(sdkMessage).toMatchObject({
      kind: 'event',
      payload: {
        type: 'headless.sdk_message',
      },
    })
    expect(output).toMatchObject({
      kind: 'event',
      payload: {
        type: 'turn.output_delta',
        payload: {
          text: 'final:hello process',
        },
      },
    })
    expect(completed).toMatchObject({
      payload: {
        type: 'turn.completed',
        payload: {
          state: 'completed',
          stopReason: 'success',
        },
      },
    })
  })

  test('aborts long-running turn executors through the execution signal', async () => {
    let executionSignal: AbortSignal | undefined
    const { router, observed } = createRouter({
      runTurnExecutor: async function* ({ signal }) {
        executionSignal = signal
        await new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(signal.reason ?? new Error('aborted')),
            { once: true },
          )
        })
      },
    })

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'hello',
    })
    await waitForObserved(observed, () => executionSignal !== undefined)

    const [abortAck] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'abort_turn',
      requestId: 'abort-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      reason: 'interrupt',
    })
    const completed = await waitForObserved(observed, envelope => {
      return (
        (envelope as { payload?: { type?: string } }).payload?.type ===
        'turn.completed'
      )
    })

    expect(executionSignal?.aborted).toBe(true)
    expect(abortAck).toMatchObject({
      kind: 'ack',
      payload: {
        state: 'aborting',
        stopReason: 'interrupt',
      },
    })
    expect(completed).toMatchObject({
      payload: {
        type: 'turn.completed',
        payload: {
          state: 'completed',
          stopReason: 'interrupt',
        },
      },
    })
  })

  test('runs multiple conversations concurrently and aborts only the targeted turn', async () => {
    const gates = new Map<string, ReturnType<typeof createDeferred>>()
    const signals = new Map<string, AbortSignal>()
    const { router, observed } = createRouter({
      runTurnExecutor: async function* ({ command, signal }) {
        signals.set(command.conversationId, signal)
        yield {
          type: 'event',
          event: {
            type: 'executor.started',
            replayable: true,
            payload: {
              conversationId: command.conversationId,
              turnId: command.turnId,
            },
          },
        }

        const gate = gates.get(command.conversationId)
        await new Promise<void>((resolve, reject) => {
          const onAbort = () => reject(signal.reason ?? new Error('aborted'))
          signal.addEventListener('abort', onAbort, { once: true })
          gate?.promise
            .then(resolve)
            .catch(reject)
            .finally(() => signal.removeEventListener('abort', onAbort))
        })
        yield {
          type: 'completed',
          stopReason: `done:${command.conversationId}`,
        }
      },
    })

    gates.set('conversation-a', createDeferred())
    gates.set('conversation-b', createDeferred())

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-a',
      conversationId: 'conversation-a',
      workspacePath: '/tmp/workspace',
    })
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-b',
      conversationId: 'conversation-b',
      workspacePath: '/tmp/workspace',
    })
    const [runA] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-a',
      conversationId: 'conversation-a',
      turnId: 'turn-a',
      prompt: 'hello a',
    })
    const [runB] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-b',
      conversationId: 'conversation-b',
      turnId: 'turn-b',
      prompt: 'hello b',
    })

    expect(runA).toMatchObject({
      kind: 'ack',
      conversationId: 'conversation-a',
      turnId: 'turn-a',
    })
    expect(runB).toMatchObject({
      kind: 'ack',
      conversationId: 'conversation-b',
      turnId: 'turn-b',
    })
    await waitForObserved(
      observed,
      envelope =>
        (envelope as { payload?: { type?: string; payload?: { conversationId?: string } } })
          .payload?.type === 'executor.started' &&
        (envelope as { payload?: { payload?: { conversationId?: string } } })
          .payload?.payload?.conversationId === 'conversation-a',
    )
    await waitForObserved(
      observed,
      envelope =>
        (envelope as { payload?: { type?: string; payload?: { conversationId?: string } } })
          .payload?.type === 'executor.started' &&
        (envelope as { payload?: { payload?: { conversationId?: string } } })
          .payload?.payload?.conversationId === 'conversation-b',
    )

    gates.get('conversation-b')?.resolve()
    const completedB = await waitForObserved(
      observed,
      envelope =>
        (envelope as { conversationId?: string; payload?: { type?: string } })
          .conversationId === 'conversation-b' &&
        (envelope as { payload?: { type?: string } }).payload?.type ===
          'turn.completed',
    )
    expect(completedB).toMatchObject({
      conversationId: 'conversation-b',
      turnId: 'turn-b',
      payload: {
        type: 'turn.completed',
        payload: {
          state: 'completed',
          stopReason: 'done:conversation-b',
        },
      },
    })
    expect(signals.get('conversation-a')?.aborted).toBe(false)

    const [abortA] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'abort_turn',
      requestId: 'abort-a',
      conversationId: 'conversation-a',
      turnId: 'turn-a',
      reason: 'interrupt-a',
    })
    const completedA = await waitForObserved(
      observed,
      envelope =>
        (envelope as { conversationId?: string; payload?: { type?: string } })
          .conversationId === 'conversation-a' &&
        (envelope as { payload?: { type?: string } }).payload?.type ===
          'turn.completed',
    )

    expect(abortA).toMatchObject({
      kind: 'ack',
      conversationId: 'conversation-a',
      turnId: 'turn-a',
      payload: {
        state: 'aborting',
        stopReason: 'interrupt-a',
      },
    })
    expect(signals.get('conversation-a')?.aborted).toBe(true)
    expect(signals.get('conversation-b')?.aborted).toBe(false)
    expect(completedA).toMatchObject({
      conversationId: 'conversation-a',
      turnId: 'turn-a',
      payload: {
        type: 'turn.completed',
        payload: {
          state: 'completed',
          stopReason: 'interrupt-a',
        },
      },
    })
  })

  test('maps executor failures to failed turn events', async () => {
    const { router, observed } = createRouter({
      runTurnExecutor: async function* () {
        yield {
          type: 'output',
          payload: { text: 'partial' },
        }
        throw new Error('executor failed')
      },
    })

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'hello',
    })

    const failed = await waitForObserved(observed, envelope => {
      return (
        (envelope as { payload?: { type?: string } }).payload?.type ===
        'turn.failed'
      )
    })

    expect(failed).toMatchObject({
      payload: {
        type: 'turn.failed',
        payload: {
          state: 'failed',
          error: {
            name: 'Error',
            message: 'executor failed',
          },
        },
      },
    })
  })

  test('returns busy instead of starting concurrent turns', async () => {
    const { router } = createRouter()

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'hello',
    })
    const [busy] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-2',
      conversationId: 'conversation-1',
      turnId: 'turn-2',
      prompt: 'second turn',
    })

    expect(busy).toMatchObject({
      kind: 'error',
      requestId: 'run-2',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      error: {
        code: 'busy',
        retryable: true,
      },
    })
  })

  test('recovers conversation snapshots and preserves active turn locks', async () => {
    const snapshots: KernelRuntimeWireConversationRecoverySnapshot[] = []
    const store: KernelRuntimeWireConversationSnapshotStore = {
      readLatest(conversationId) {
        for (let index = snapshots.length - 1; index >= 0; index -= 1) {
          const snapshot = snapshots[index]
          if (snapshot?.conversation.conversationId === conversationId) {
            return snapshot
          }
        }
        return undefined
      },
      append(snapshot) {
        snapshots.push(snapshot)
      },
    }

    const first = createRouter({ conversationSnapshotStore: store })
    await first.router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })
    await first.router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'hello',
    })

    expect(snapshots.at(-1)).toMatchObject({
      conversation: {
        conversationId: 'conversation-1',
        state: 'running',
        activeTurnId: 'turn-1',
      },
      activeTurn: {
        turnId: 'turn-1',
        state: 'running',
      },
    })

    const second = createRouter({ conversationSnapshotStore: store })
    const [recovered] = await second.router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-2',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })

    expect(recovered).toMatchObject({
      kind: 'ack',
      requestId: 'create-2',
      conversationId: 'conversation-1',
      payload: {
        state: 'detached',
        activeTurnId: 'turn-1',
      },
    })
    expect(
      second.observed.some(
        envelope =>
          (envelope as { payload?: { type?: string } }).payload?.type ===
          'conversation.recovered',
      ),
    ).toBe(true)

    const [busy] = await second.router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-2',
      conversationId: 'conversation-1',
      turnId: 'turn-2',
      prompt: 'second turn',
    })
    expect(busy).toMatchObject({
      kind: 'error',
      requestId: 'run-2',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      error: {
        code: 'busy',
        retryable: true,
      },
    })

    const [abortAck] = await second.router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'abort_turn',
      requestId: 'abort-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      reason: 'after_crash',
    })

    expect(abortAck).toMatchObject({
      kind: 'ack',
      requestId: 'abort-1',
      payload: {
        state: 'aborting',
        stopReason: 'after_crash',
      },
    })
    expect(snapshots.at(-1)).toMatchObject({
      conversation: {
        conversationId: 'conversation-1',
        state: 'aborting',
        activeTurnId: 'turn-1',
      },
      activeTurn: {
        turnId: 'turn-1',
        state: 'aborting',
        stopReason: 'after_crash',
      },
    })
  })

  test('returns not_found for commands targeting missing conversations', async () => {
    const { router } = createRouter()

    const [missing] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'abort_turn',
      requestId: 'abort-1',
      conversationId: 'missing-conversation',
      turnId: 'turn-1',
      reason: 'interrupt',
    })

    expect(missing).toMatchObject({
      kind: 'error',
      requestId: 'abort-1',
      conversationId: 'missing-conversation',
      error: {
        code: 'not_found',
        retryable: false,
      },
    })
  })

  test('routes permission decisions through the runtime permission broker', async () => {
    const permissionBroker = new RuntimePermissionBroker()
    const { router } = createRouter({ permissionBroker })
    const pending = permissionBroker.requestPermission(
      createPermissionRequest('permission-1'),
    )

    const [ack] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'decide_permission',
      requestId: 'permission-decision-1',
      permissionRequestId: 'permission-1',
      decision: 'allow_once',
      decidedBy: 'host',
      reason: 'approved from host',
    })

    expect(ack).toMatchObject({
      kind: 'ack',
      requestId: 'permission-decision-1',
      payload: {
        permissionRequestId: 'permission-1',
        decision: 'allow_once',
        decidedBy: 'host',
        reason: 'approved from host',
      },
    })
    await expect(pending).resolves.toMatchObject({
      permissionRequestId: 'permission-1',
      decision: 'allow_once',
      decidedBy: 'host',
    })
  })

  test('exposes the shared permission broker to turn executors', async () => {
    const permissionBroker = new RuntimePermissionBroker()
    const runTurnExecutor: KernelRuntimeWireTurnExecutor = async function* (
      context,
    ) {
      const decision = await context.permissionBroker!.requestPermission(
        createPermissionRequest('permission-1', {
          conversationId: context.command.conversationId,
          turnId: context.command.turnId,
        }),
      )
      yield {
        type: 'event',
        event: {
          type: 'executor.permission_decision',
          replayable: true,
          payload: decision,
        },
      }
      yield { type: 'completed', stopReason: 'end_turn' }
    }
    const { router, observed } = createRouter({
      permissionBroker,
      runTurnExecutor,
    })

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-conversation-1',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
    })
    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'run_turn',
      requestId: 'run-turn-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      prompt: 'hello',
    })

    await waitForPendingPermission(permissionBroker, 'permission-1')

    await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'decide_permission',
      requestId: 'permission-decision-1',
      permissionRequestId: 'permission-1',
      decision: 'allow_once',
      decidedBy: 'host',
      reason: 'approved from host',
    })

    const permissionDecisionEvent = await waitForObserved(
      observed,
      envelope =>
        (envelope as { payload?: { type?: string } }).payload?.type ===
        'executor.permission_decision',
    )

    expect(permissionDecisionEvent).toMatchObject({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      payload: {
        type: 'executor.permission_decision',
        payload: {
          permissionRequestId: 'permission-1',
          decision: 'allow_once',
          decidedBy: 'host',
        },
      },
    })
  })

  test('maps missing permission decisions to not_found', async () => {
    const permissionBroker = new RuntimePermissionBroker()
    const { router } = createRouter({ permissionBroker })

    const [error] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'decide_permission',
      requestId: 'permission-decision-missing',
      permissionRequestId: 'missing-permission',
      decision: 'deny',
      decidedBy: 'host',
      reason: 'missing',
    })

    expect(error).toMatchObject({
      kind: 'error',
      requestId: 'permission-decision-missing',
      error: {
        code: 'not_found',
        retryable: false,
        details: {
          permissionRequestId: 'missing-permission',
        },
      },
    })
  })

  test('parses abort_turn from an NDJSON command line', () => {
    const command = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'abort_turn',
        requestId: 'abort-1',
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        reason: 'interrupt',
      }),
    )

    expect(command).toEqual({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'abort_turn',
      requestId: 'abort-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      reason: 'interrupt',
    })
  })

  test('parses decide_permission from an NDJSON command line', () => {
    const command = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'decide_permission',
        requestId: 'permission-decision-1',
        permissionRequestId: 'permission-1',
        decision: 'allow_session',
        decidedBy: 'host',
        reason: 'trusted workspace',
        expiresAt: '2026-04-26T01:00:00.000Z',
      }),
    )

    expect(command).toEqual({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'decide_permission',
      requestId: 'permission-decision-1',
      permissionRequestId: 'permission-1',
      decision: 'allow_session',
      decidedBy: 'host',
      reason: 'trusted workspace',
      expiresAt: '2026-04-26T01:00:00.000Z',
    })
  })

  test('parses reload and host event payloads from NDJSON command lines', () => {
    const connectHost = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'connect_host',
        requestId: 'connect-1',
        host: testHost,
        sinceEventId: 'conversation-1:1',
      }),
    )
    const disconnectHost = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'disconnect_host',
        requestId: 'disconnect-1',
        hostId: 'desktop-host-1',
        policy: 'abort_active_turns',
        reason: 'host_closed',
      }),
    )
    const reload = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'reload_capabilities',
        requestId: 'reload-1',
        scope: { type: 'capability', name: 'tools' },
      }),
    )
    const hostEvent = parseKernelRuntimeCommandLine(
      JSON.stringify({
        schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
        type: 'publish_host_event',
        requestId: 'host-event-1',
        event: {
          type: 'host.focus_changed',
          replayable: true,
          payload: { focused: true },
        },
      }),
    )

    expect(connectHost).toMatchObject({
      type: 'connect_host',
      host: testHost,
      sinceEventId: 'conversation-1:1',
    })
    expect(disconnectHost).toMatchObject({
      type: 'disconnect_host',
      hostId: 'desktop-host-1',
      policy: 'abort_active_turns',
      reason: 'host_closed',
    })
    expect(reload).toMatchObject({
      type: 'reload_capabilities',
      scope: { type: 'capability', name: 'tools' },
    })
    expect(hostEvent).toMatchObject({
      type: 'publish_host_event',
      event: {
        type: 'host.focus_changed',
        payload: { focused: true },
      },
    })
  })

  test('maps malformed wire messages to schema_mismatch errors', async () => {
    const { router } = createRouter()

    const [error] = await router.handleMessage({
      schemaVersion: 'kernel.runtime.command.v0',
      type: 'ping',
      requestId: 'bad-1',
    })

    expect(error).toMatchObject({
      kind: 'error',
      requestId: 'bad-1',
      error: {
        code: 'schema_mismatch',
        retryable: false,
        details: {
          expected: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
          actual: 'kernel.runtime.command.v0',
        },
      },
    })
  })

  test('serializes runtime envelopes as JSON lines', async () => {
    const { router } = createRouter()
    const [pong] = await router.handleMessage({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'ping',
      requestId: 'ping-1',
    })

    expect(JSON.parse(serializeKernelRuntimeEnvelope(pong))).toMatchObject({
      kind: 'pong',
      requestId: 'ping-1',
      schemaVersion: 'kernel.runtime.v1',
    })
  })

  test('reloads capabilities through the injected resolver and emits an event', async () => {
    const capabilityResolver = createRuntimeCapabilityResolver([
      { name: 'events', reloadable: false },
      { name: 'tools', dependencies: ['events'] },
    ])
    await capabilityResolver.requireCapability('tools')
    const { router, observed } = createRouter({ capabilityResolver })

    const [ack] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'reload_capabilities',
      requestId: 'reload-1',
      scope: { type: 'capability', name: 'tools' },
    })

    expect(ack).toMatchObject({
      kind: 'ack',
      requestId: 'reload-1',
      payload: {
        descriptors: expect.arrayContaining([
          expect.objectContaining({
            name: 'tools',
            status: 'declared',
          }),
        ]),
      },
    })
    expect(observed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'event',
          payload: expect.objectContaining({
            type: 'capabilities.reloaded',
          }),
        }),
      ]),
    )
  })

  test('loads capability intent before creating a conversation', async () => {
    const loaded: string[] = []
    const capabilityResolver = createRuntimeCapabilityResolver([
      {
        name: 'tools',
        load: async () => {
          loaded.push('tools')
          return ['tool-registry']
        },
      },
      {
        name: 'mcp',
        load: async () => {
          loaded.push('mcp')
          return ['mcp-registry']
        },
      },
    ])
    const { router, observed } = createRouter({ capabilityResolver })

    const [ack] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'create_conversation',
      requestId: 'create-with-capabilities',
      conversationId: 'conversation-1',
      workspacePath: '/tmp/workspace',
      capabilityIntent: {
        requiredCapabilities: ['tools'],
        mcp: true,
      },
    })

    expect(ack).toMatchObject({
      kind: 'ack',
      requestId: 'create-with-capabilities',
      conversationId: 'conversation-1',
    })
    expect(loaded.sort()).toEqual(['mcp', 'tools'])
    expect(
      observed.map(
        envelope =>
          (envelope as { payload?: { type?: string } }).payload?.type,
      ),
    ).toEqual([
      'capabilities.required',
      'conversation.ready',
    ])
    expect(
      observed.find(
        envelope =>
          (envelope as { payload?: { type?: string } }).payload?.type ===
          'capabilities.required',
      ),
    ).toMatchObject({
      conversationId: 'conversation-1',
      payload: {
        payload: {
          capabilities: ['tools', 'mcp'],
          descriptors: expect.arrayContaining([
            expect.objectContaining({ name: 'tools', status: 'ready' }),
            expect.objectContaining({ name: 'mcp', status: 'ready' }),
          ]),
        },
      },
    })
  })

  test('publishes host events onto the runtime event bus', async () => {
    const { router } = createRouter()

    const [ack] = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'publish_host_event',
      requestId: 'host-event-1',
      event: {
        conversationId: 'conversation-1',
        type: 'host.focus_changed',
        replayable: true,
        payload: { focused: true },
      },
    })
    const replay = await router.handleCommand({
      schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
      type: 'subscribe_events',
      requestId: 'subscribe-host-events',
      conversationId: 'conversation-1',
    })

    expect(ack).toMatchObject({
      kind: 'ack',
      requestId: 'host-event-1',
      conversationId: 'conversation-1',
      payload: {
        published: true,
      },
    })
    expect(
      replay
        .filter(envelope => envelope.kind === 'event')
        .map(envelope => envelope.payload)
        .map(payload => (payload as { type?: string }).type),
    ).toEqual(['host.focus_changed'])
  })
})
