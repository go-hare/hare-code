import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { once } from 'events'
import { createInterface } from 'readline'

import type {
  KernelEvent,
  KernelRuntimeEnvelopeBase,
  KernelRuntimeEventSink,
} from '../../contracts/events.js'
import type {
  KernelRuntimeHostIdentity,
  KernelRuntimeTransportKind,
} from '../../contracts/runtime.js'
import type {
  KernelRuntimeCommand,
  KernelRuntimeConnectHostCommand,
  KernelRuntimeCreateConversationCommand,
  KernelRuntimeDecidePermissionCommand,
  KernelRuntimeDisconnectHostCommand,
  KernelRuntimeHostDisconnectPolicy,
  KernelRuntimeReloadCapabilitiesCommand,
  KernelRuntimeSubscribeEventsCommand,
} from '../../contracts/wire.js'
import { KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION } from '../../contracts/wire.js'
import type { KernelRuntimeWireRouter } from './KernelRuntimeWireRouter.js'

type PendingRequest = {
  command: KernelRuntimeCommand
  resolve(envelope: KernelRuntimeEnvelopeBase): void
  reject(error: Error): void
}

type EventSubscriptionScope = Pick<
  KernelRuntimeSubscribeEventsCommand,
  'conversationId' | 'turnId'
>

export type KernelRuntimeWireTransport = {
  readonly kind: KernelRuntimeTransportKind
  send(command: KernelRuntimeCommand): Promise<KernelRuntimeEnvelopeBase>
  subscribe(handler: KernelRuntimeEventSink): () => void
  close(): Promise<void> | void
}

export type KernelRuntimeWireClientCommand<
  TCommand extends KernelRuntimeCommand,
> = Omit<TCommand, 'schemaVersion' | 'requestId'> & {
  requestId?: string
  schemaVersion?: typeof KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION
}

export type KernelRuntimeWireClientOptions = {
  createRequestId?: (command: KernelRuntimeCommand['type']) => string
}

export type KernelRuntimeWireClient = {
  request<TCommand extends KernelRuntimeCommand>(
    command: KernelRuntimeWireClientCommand<TCommand>,
  ): Promise<KernelRuntimeEnvelopeBase>
  onEvent(handler: KernelRuntimeEventSink): () => void
  ping(): Promise<KernelRuntimeEnvelopeBase>
  connectHost(
    host: KernelRuntimeHostIdentity,
    options?: {
      requestId?: string
      sinceEventId?: string
      metadata?: Record<string, unknown>
    },
  ): Promise<KernelRuntimeEnvelopeBase>
  disconnectHost(
    hostId: string,
    options?: {
      requestId?: string
      reason?: string
      policy?: KernelRuntimeHostDisconnectPolicy
      metadata?: Record<string, unknown>
    },
  ): Promise<KernelRuntimeEnvelopeBase>
  createConversation(
    command: KernelRuntimeWireClientCommand<KernelRuntimeCreateConversationCommand>,
  ): Promise<KernelRuntimeEnvelopeBase>
  runTurn(
    command: KernelRuntimeWireClientCommand<
      Extract<KernelRuntimeCommand, { type: 'run_turn' }>
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  abortTurn(
    command: KernelRuntimeWireClientCommand<
      Extract<KernelRuntimeCommand, { type: 'abort_turn' }>
    >,
  ): Promise<KernelRuntimeEnvelopeBase>
  decidePermission(
    command: KernelRuntimeWireClientCommand<KernelRuntimeDecidePermissionCommand>,
  ): Promise<KernelRuntimeEnvelopeBase>
  subscribeEvents(
    command: KernelRuntimeWireClientCommand<KernelRuntimeSubscribeEventsCommand>,
  ): Promise<KernelRuntimeEnvelopeBase>
  reloadCapabilities(
    command: KernelRuntimeWireClientCommand<KernelRuntimeReloadCapabilitiesCommand>,
  ): Promise<KernelRuntimeEnvelopeBase>
  publishHostEvent(
    event: KernelEvent,
    options?: { requestId?: string; metadata?: Record<string, unknown> },
  ): Promise<KernelRuntimeEnvelopeBase>
  close(): Promise<void> | void
}

export type KernelRuntimeInProcessWireTransportOptions = {
  router: KernelRuntimeWireRouter
}

export type KernelRuntimeStdioWireTransportOptions = {
  command: string
  args?: readonly string[]
  cwd?: string
  env?: Record<string, string | undefined>
  closeTimeoutMs?: number
  stderr?: (chunk: string) => void
}

export function createKernelRuntimeWireClient(
  transport: KernelRuntimeWireTransport,
  options: KernelRuntimeWireClientOptions = {},
): KernelRuntimeWireClient {
  let nextRequestNumber = 1
  const createRequestId =
    options.createRequestId ??
    ((type: KernelRuntimeCommand['type']) => {
      return `${type}-${nextRequestNumber++}`
    })

  const request = <TCommand extends KernelRuntimeCommand>(
    command: KernelRuntimeWireClientCommand<TCommand>,
  ): Promise<KernelRuntimeEnvelopeBase> => {
    return transport.send(normalizeCommand(command, createRequestId))
  }

  return {
    request,
    onEvent: handler => transport.subscribe(handler),
    ping: () =>
      request({ type: 'ping' } as KernelRuntimeWireClientCommand<
        Extract<KernelRuntimeCommand, { type: 'ping' }>
      >),
    connectHost: (host, commandOptions = {}) =>
      request<KernelRuntimeConnectHostCommand>({
        type: 'connect_host',
        host,
        ...commandOptions,
      }),
    disconnectHost: (hostId, commandOptions = {}) =>
      request<KernelRuntimeDisconnectHostCommand>({
        type: 'disconnect_host',
        hostId,
        ...commandOptions,
      }),
    createConversation: command =>
      request<KernelRuntimeCreateConversationCommand>({
        ...command,
        type: 'create_conversation',
      }),
    runTurn: command =>
      request<Extract<KernelRuntimeCommand, { type: 'run_turn' }>>({
        ...command,
        type: 'run_turn',
      }),
    abortTurn: command =>
      request<Extract<KernelRuntimeCommand, { type: 'abort_turn' }>>({
        ...command,
        type: 'abort_turn',
      }),
    decidePermission: command =>
      request<KernelRuntimeDecidePermissionCommand>({
        ...command,
        type: 'decide_permission',
      }),
    subscribeEvents: command =>
      request<KernelRuntimeSubscribeEventsCommand>({
        ...command,
        type: 'subscribe_events',
      }),
    reloadCapabilities: command =>
      request<KernelRuntimeReloadCapabilitiesCommand>({
        ...command,
        type: 'reload_capabilities',
      }),
    publishHostEvent: (event, commandOptions = {}) =>
      request<Extract<KernelRuntimeCommand, { type: 'publish_host_event' }>>({
        type: 'publish_host_event',
        event,
        ...commandOptions,
      }),
    close: () => transport.close(),
  }
}

export function createKernelRuntimeInProcessWireTransport(
  options: KernelRuntimeInProcessWireTransportOptions,
): KernelRuntimeWireTransport {
  let closed = false
  const listeners = new Set<KernelRuntimeEventSink>()
  const liveSubscriptions: EventSubscriptionScope[] = []
  const unsubscribe = options.router.eventBus.subscribe(envelope => {
    if (shouldDeliverEvent(liveSubscriptions, envelope)) {
      notifyListeners(listeners, envelope)
    }
  })

  return {
    kind: 'in-process',
    async send(command) {
      if (closed) {
        throw new Error('Kernel runtime wire transport is closed')
      }

      const responses = await options.router.handleCommand(command)
      let controlEnvelope: KernelRuntimeEnvelopeBase | undefined
      for (const envelope of responses) {
        if (
          envelope.requestId === command.requestId &&
          isControlEnvelope(envelope)
        ) {
          controlEnvelope = envelope
        }
      }
      if (command.type === 'subscribe_events' && controlEnvelope?.kind === 'ack') {
        recordLiveSubscription(liveSubscriptions, command)
      }
      for (const envelope of responses) {
        if (shouldDeliverEvent(liveSubscriptions, envelope)) {
          notifyListeners(listeners, envelope)
        }
      }
      if (!controlEnvelope) {
        throw new Error(
          `Kernel runtime command ${command.requestId} completed without an ack, pong, or error envelope`,
        )
      }
      return controlEnvelope
    },
    subscribe(handler) {
      listeners.add(handler)
      return () => {
        listeners.delete(handler)
      }
    },
    close() {
      if (closed) {
        return
      }
      closed = true
      unsubscribe()
      listeners.clear()
    },
  }
}

export function createKernelRuntimeStdioWireTransport(
  options: KernelRuntimeStdioWireTransportOptions,
): KernelRuntimeWireTransport {
  return new KernelRuntimeStdioWireTransport(options)
}

class KernelRuntimeStdioWireTransport implements KernelRuntimeWireTransport {
  readonly kind: KernelRuntimeTransportKind = 'stdio'
  private readonly child: ChildProcessWithoutNullStreams
  private readonly listeners = new Set<KernelRuntimeEventSink>()
  private readonly pending = new Map<string, PendingRequest>()
  private readonly liveSubscriptions: EventSubscriptionScope[] = []
  private readonly closeTimeoutMs: number
  private closed = false

  constructor(options: KernelRuntimeStdioWireTransportOptions) {
    this.closeTimeoutMs = options.closeTimeoutMs ?? 2_000
    this.child = spawn(options.command, [...(options.args ?? [])], {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.child.stdout.setEncoding('utf8')
    this.child.stderr.setEncoding('utf8')
    this.child.stderr.on('data', chunk => {
      options.stderr?.(String(chunk))
    })
    this.child.once('error', error => {
      this.rejectAll(error)
    })
    this.child.once('exit', (code, signal) => {
      this.closed = true
      this.rejectAll(
        new Error(
          `Kernel runtime stdio transport exited with code ${code ?? 'null'} and signal ${signal ?? 'null'}`,
        ),
      )
    })
    void this.consumeStdout()
  }

  async send(
    command: KernelRuntimeCommand,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (this.closed || !this.child.stdin.writable) {
      throw new Error('Kernel runtime stdio transport is closed')
    }
    if (this.pending.has(command.requestId)) {
      throw new Error(`Duplicate pending requestId ${command.requestId}`)
    }

    const promise = new Promise<KernelRuntimeEnvelopeBase>(
      (resolve, reject) => {
        this.pending.set(command.requestId, {
          command,
          resolve,
          reject,
        })
      },
    )

    this.child.stdin.write(`${JSON.stringify(command)}\n`, error => {
      if (!error) {
        return
      }
      const pending = this.pending.get(command.requestId)
      this.pending.delete(command.requestId)
      pending?.reject(error)
    })

    return promise
  }

  subscribe(handler: KernelRuntimeEventSink): () => void {
    this.listeners.add(handler)
    return () => {
      this.listeners.delete(handler)
    }
  }

  async close(): Promise<void> {
    if (this.closed) {
      return
    }
    this.closed = true
    this.child.stdin.end()
    const timeout = setTimeout(() => {
      this.child.kill('SIGTERM')
    }, this.closeTimeoutMs)
    try {
      if (this.child.exitCode === null && !this.child.killed) {
        await once(this.child, 'exit')
      }
    } finally {
      clearTimeout(timeout)
      this.rejectAll(new Error('Kernel runtime stdio transport closed'))
      this.listeners.clear()
    }
  }

  private async consumeStdout(): Promise<void> {
    const lines = createInterface({
      input: this.child.stdout,
      crlfDelay: Number.POSITIVE_INFINITY,
    })
    try {
      for await (const line of lines) {
        if (line.trim().length === 0) {
          continue
        }
        this.handleEnvelope(JSON.parse(line) as KernelRuntimeEnvelopeBase)
      }
    } catch (error) {
      this.rejectAll(error instanceof Error ? error : new Error(String(error)))
    }
  }

  private handleEnvelope(envelope: KernelRuntimeEnvelopeBase): void {
    if (shouldDeliverEvent(this.liveSubscriptions, envelope)) {
      notifyListeners(this.listeners, envelope)
    }

    if (!envelope.requestId || !isControlEnvelope(envelope)) {
      return
    }

    const pending = this.pending.get(envelope.requestId)
    if (!pending) {
      return
    }
    this.pending.delete(envelope.requestId)
    if (pending.command.type === 'subscribe_events' && envelope.kind === 'ack') {
      recordLiveSubscription(this.liveSubscriptions, pending.command)
    }
    pending.resolve(envelope)
  }

  private rejectAll(error: Error): void {
    for (const [, pending] of this.pending) {
      pending.reject(error)
    }
    this.pending.clear()
  }
}

function normalizeCommand<TCommand extends KernelRuntimeCommand>(
  command: KernelRuntimeWireClientCommand<TCommand>,
  createRequestId: (type: KernelRuntimeCommand['type']) => string,
): TCommand {
  const type = command.type as KernelRuntimeCommand['type']
  return {
    ...command,
    schemaVersion:
      command.schemaVersion ?? KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    requestId: command.requestId ?? createRequestId(type),
  } as TCommand
}

function isControlEnvelope(envelope: KernelRuntimeEnvelopeBase): boolean {
  return (
    envelope.kind === 'ack' ||
    envelope.kind === 'pong' ||
    envelope.kind === 'error'
  )
}

function notifyListeners(
  listeners: Set<KernelRuntimeEventSink>,
  envelope: KernelRuntimeEnvelopeBase,
): void {
  for (const listener of listeners) {
    try {
      listener(envelope)
    } catch {
      // Host observers must not change transport request semantics.
    }
  }
}

function recordLiveSubscription(
  subscriptions: EventSubscriptionScope[],
  command: KernelRuntimeSubscribeEventsCommand,
): void {
  const scope: EventSubscriptionScope = {
    conversationId: command.conversationId,
    turnId: command.turnId,
  }
  if (
    subscriptions.some(
      subscription =>
        subscription.conversationId === scope.conversationId &&
        subscription.turnId === scope.turnId,
    )
  ) {
    return
  }
  subscriptions.push(scope)
}

function shouldDeliverEvent(
  subscriptions: readonly EventSubscriptionScope[],
  envelope: KernelRuntimeEnvelopeBase,
): boolean {
  if (envelope.kind !== 'event') {
    return false
  }
  if (!envelope.conversationId && !envelope.turnId) {
    return true
  }
  if (subscriptions.length === 0) {
    return true
  }
  return subscriptions.some(subscription =>
    matchesSubscription(subscription, envelope),
  )
}

function matchesSubscription(
  subscription: EventSubscriptionScope,
  envelope: KernelRuntimeEnvelopeBase,
): boolean {
  if (
    subscription.conversationId &&
    envelope.conversationId !== subscription.conversationId
  ) {
    return false
  }
  if (subscription.turnId && envelope.turnId !== subscription.turnId) {
    return false
  }
  return true
}
