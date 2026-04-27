import type {
  KernelCapabilityDescriptor,
  KernelCapabilityName,
  KernelRuntimeCapabilityReloadRequest,
} from '../../contracts/capability.js'
import type {
  KernelConversationId,
  KernelConversationSnapshot,
} from '../../contracts/conversation.js'
import type {
  KernelEvent,
  KernelRuntimeEnvelopeBase,
} from '../../contracts/events.js'
import type {
  KernelRuntimeHostIdentity,
  KernelRuntimeId,
} from '../../contracts/runtime.js'
import type {
  KernelPermissionDecision,
  KernelPermissionRequest,
  KernelPermissionRequestId,
} from '../../contracts/permissions.js'
import type { KernelTurnId, KernelTurnSnapshot } from '../../contracts/turn.js'
import type {
  KernelRuntimeCommand,
  KernelRuntimeConnectHostCommand,
  KernelRuntimeCreateConversationCommand,
  KernelRuntimeDisconnectHostCommand,
  KernelRuntimeHostDisconnectPolicy,
  KernelRuntimeRunTurnCommand,
  KernelRuntimeSubscribeEventsCommand,
} from '../../contracts/wire.js'
import { RuntimeConversationBusyError } from '../conversation/RuntimeConversation.js'
import {
  RuntimeEventBus,
  RuntimeEventReplayError,
} from '../events/RuntimeEventBus.js'
import {
  KernelRuntimeWireCommandParseError,
  parseKernelRuntimeCommandLine,
  parseKernelRuntimeCommand,
} from './KernelRuntimeWireCodec.js'

export type KernelRuntimeWireConversationOptions = {
  runtimeId: KernelRuntimeId
  conversationId: KernelConversationId
  workspacePath: string
  sessionId?: string
  initialSnapshot?: KernelConversationSnapshot
  initialActiveTurnSnapshot?: KernelTurnSnapshot
  eventBus: RuntimeEventBus
}

export type KernelRuntimeWireConversation = {
  readonly id: KernelConversationId
  readonly activeTurnId: KernelTurnId | undefined
  snapshot(): KernelConversationSnapshot
  runTurn(request: {
    turnId: KernelTurnId
    prompt: string | readonly unknown[]
    attachments?: readonly unknown[]
    metadata?: Record<string, unknown>
  }): KernelTurnSnapshot
  completeTurn(
    turnId: KernelTurnId,
    stopReason?: string | null,
  ): KernelTurnSnapshot
  failTurn(turnId: KernelTurnId, error: unknown): KernelTurnSnapshot
  abortTurn(turnId: KernelTurnId, reason?: string): KernelTurnSnapshot
  dispose(reason?: string): Promise<void>
}

export type KernelRuntimeWireTurnExecutionEvent =
  | {
      type: 'output'
      payload: unknown
      replayable?: boolean
      metadata?: Record<string, unknown>
    }
  | {
      type: 'event'
      event: Omit<KernelEvent, 'runtimeId' | 'conversationId' | 'turnId'> &
        Partial<Pick<KernelEvent, 'runtimeId' | 'conversationId' | 'turnId'>>
    }
  | {
      type: 'completed'
      stopReason?: string | null
      metadata?: Record<string, unknown>
    }
  | {
      type: 'failed'
      error: unknown
      metadata?: Record<string, unknown>
    }

export type KernelRuntimeWireTurnExecutionResult =
  | void
  | Promise<void>
  | AsyncIterable<KernelRuntimeWireTurnExecutionEvent>

export type KernelRuntimeWireTurnExecutionContext = {
  command: Extract<KernelRuntimeCommand, { type: 'run_turn' }>
  conversation: KernelRuntimeWireConversation
  eventBus: RuntimeEventBus
  permissionBroker?: KernelRuntimeWirePermissionBroker
  signal: AbortSignal
}

export type KernelRuntimeWireTurnExecutor = (
  context: KernelRuntimeWireTurnExecutionContext,
) => KernelRuntimeWireTurnExecutionResult

export type KernelRuntimeWireRouterOptions = {
  runtimeId: KernelRuntimeId
  workspacePath: string
  eventBus?: RuntimeEventBus
  conversationSnapshotStore?: KernelRuntimeWireConversationSnapshotStore
  capabilityResolver?: KernelRuntimeWireCapabilityResolver
  permissionBroker?: KernelRuntimeWirePermissionBroker
  runTurnExecutor?: KernelRuntimeWireTurnExecutor
  createConversation(
    options: KernelRuntimeWireConversationOptions,
    command: KernelRuntimeCreateConversationCommand,
  ): KernelRuntimeWireConversation
}

type KernelRuntimeWireHostState = 'connected' | 'disconnected'

type KernelRuntimeWireHostRecord = {
  identity: KernelRuntimeHostIdentity
  state: KernelRuntimeWireHostState
  connectCount: number
  disconnectReason?: string
  disconnectPolicy?: KernelRuntimeHostDisconnectPolicy
}

type Awaitable<T> = T | Promise<T>

export type KernelRuntimeWireConversationRecoverySnapshot = {
  conversation: KernelConversationSnapshot
  activeTurn?: KernelTurnSnapshot
  activeExecution?: KernelRuntimeRunTurnCommand
}

export type KernelRuntimeWireConversationSnapshotStore = {
  readLatest(
    conversationId: KernelConversationId,
  ): Awaitable<KernelRuntimeWireConversationRecoverySnapshot | undefined>
  append(
    snapshot: KernelRuntimeWireConversationRecoverySnapshot,
  ): Awaitable<void>
}

export type KernelRuntimeWireCapabilityResolver = {
  listDescriptors(): readonly KernelCapabilityDescriptor[]
  requireCapability?(
    name: KernelCapabilityName,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Promise<unknown>
  reloadCapabilities(
    scope: KernelRuntimeCapabilityReloadRequest['scope'],
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Promise<readonly KernelCapabilityDescriptor[]>
}

export type KernelRuntimeWirePermissionBroker = {
  requestPermission(
    request: KernelPermissionRequest,
  ): Promise<KernelPermissionDecision>
  decide(decision: KernelPermissionDecision): KernelPermissionDecision
  snapshot?(): {
    pendingRequestIds: KernelPermissionRequestId[]
    finalizedRequestIds: KernelPermissionRequestId[]
  }
}

export class KernelRuntimeWireRouter {
  readonly eventBus: RuntimeEventBus
  private readonly conversations = new Map<
    KernelConversationId,
    KernelRuntimeWireConversation
  >()
  private readonly activeExecutions = new Map<string, AbortController>()
  private readonly hosts = new Map<string, KernelRuntimeWireHostRecord>()

  constructor(private readonly options: KernelRuntimeWireRouterOptions) {
    this.eventBus =
      options.eventBus ??
      new RuntimeEventBus({
        runtimeId: options.runtimeId,
      })
  }

  async handleCommand(
    command: KernelRuntimeCommand,
  ): Promise<KernelRuntimeEnvelopeBase[]> {
    try {
      switch (command.type) {
        case 'ping':
          return [this.eventBus.pong({ requestId: command.requestId })]
        case 'init_runtime':
          return this.handleInit(command.requestId)
        case 'connect_host':
          return this.handleConnectHost(command)
        case 'disconnect_host':
          return [await this.handleDisconnectHost(command)]
        case 'create_conversation':
          return [await this.handleCreateConversation(command)]
        case 'run_turn':
          return [await this.handleRunTurn(command)]
        case 'abort_turn':
          return [await this.handleAbortTurn(command)]
        case 'decide_permission':
          return [this.handleDecidePermission(command)]
        case 'dispose_conversation':
          return [await this.handleDisposeConversation(command)]
        case 'subscribe_events':
          return this.handleSubscribeEvents(command)
        case 'reload_capabilities':
          return [await this.handleReloadCapabilities(command)]
        case 'publish_host_event':
          return [this.handlePublishHostEvent(command)]
      }
    } catch (error) {
      return [this.mapError(command, error)]
    }
  }

  async handleMessage(message: unknown): Promise<KernelRuntimeEnvelopeBase[]> {
    try {
      return await this.handleCommand(parseKernelRuntimeCommand(message))
    } catch (error) {
      if (error instanceof KernelRuntimeWireCommandParseError) {
        return [
          this.eventBus.error({
            requestId: error.requestId,
            code: 'schema_mismatch',
            message: error.message,
            retryable: false,
            details: error.details,
          }),
        ]
      }
      return [
        this.eventBus.error({
          code: 'internal_error',
          message: error instanceof Error ? error.message : String(error),
          retryable: false,
        }),
      ]
    }
  }

  async handleCommandLine(line: string): Promise<KernelRuntimeEnvelopeBase[]> {
    try {
      return await this.handleCommand(parseKernelRuntimeCommandLine(line))
    } catch (error) {
      if (error instanceof KernelRuntimeWireCommandParseError) {
        return [
          this.eventBus.error({
            requestId: error.requestId,
            code: 'schema_mismatch',
            message: error.message,
            retryable: false,
            details: error.details,
          }),
        ]
      }
      return [
        this.eventBus.error({
          code: 'internal_error',
          message: error instanceof Error ? error.message : String(error),
          retryable: false,
        }),
      ]
    }
  }

  private handleInit(requestId: string): KernelRuntimeEnvelopeBase[] {
    const ack = this.eventBus.ack({
      requestId,
      payload: {
        runtimeId: this.options.runtimeId,
        state: 'ready',
      },
    })
    this.eventBus.emit({
      type: 'runtime.ready',
      replayable: true,
      payload: {
        runtimeId: this.options.runtimeId,
        workspacePath: this.options.workspacePath,
      },
    })
    return [ack]
  }

  private handleConnectHost(
    command: KernelRuntimeConnectHostCommand,
  ): KernelRuntimeEnvelopeBase[] {
    const replay = this.replayRuntimeScopedEvents(command.sinceEventId)
    const previous = this.hosts.get(command.host.id)
    const record: KernelRuntimeWireHostRecord = {
      identity: command.host,
      state: 'connected',
      connectCount: (previous?.connectCount ?? 0) + 1,
    }
    this.hosts.set(command.host.id, record)
    this.eventBus.emit({
      type: previous ? 'host.reconnected' : 'host.connected',
      replayable: true,
      payload: sanitizeWirePayload({
        host: command.host,
        previousState: previous?.state,
        replayedEvents: replay.length,
        sinceEventId: command.sinceEventId,
      }),
      metadata: command.metadata,
    })
    const ack = this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload({
        connected: true,
        hostId: command.host.id,
        state: record.state,
        previousState: previous?.state,
        replayedEvents: replay.length,
      }),
    })
    return [ack, ...replay]
  }

  private async handleDisconnectHost(
    command: KernelRuntimeDisconnectHostCommand,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const host = this.requireHost(command.hostId, command.requestId)
    const policy = command.policy ?? 'detach'
    const abortedTurnIds =
      policy === 'abort_active_turns'
        ? await this.abortActiveTurnsForHostDisconnect(command)
        : []
    const record: KernelRuntimeWireHostRecord = {
      ...host,
      state: 'disconnected',
      disconnectReason: command.reason,
      disconnectPolicy: policy,
    }
    this.hosts.set(command.hostId, record)
    this.eventBus.emit({
      type: 'host.disconnected',
      replayable: true,
      payload: sanitizeWirePayload({
        hostId: command.hostId,
        policy,
        reason: command.reason,
        abortedTurnIds,
      }),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload({
        disconnected: true,
        hostId: command.hostId,
        policy,
        reason: command.reason,
        abortedTurnIds,
      }),
    })
  }

  private async handleCreateConversation(
    command: KernelRuntimeCreateConversationCommand,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const existing = this.conversations.get(command.conversationId)
    if (existing) {
      this.assertExistingConversationMatches(existing, command)
      return this.eventBus.ack({
        requestId: command.requestId,
        conversationId: existing.id,
        payload: sanitizeWirePayload(existing.snapshot()),
      })
    }
    await this.requireCapabilityIntent(command)
    const recoveredSnapshot = await this.readRecoveredConversation(command)
    const sessionId =
      command.sessionId ?? recoveredSnapshot?.conversation.sessionId

    const conversation = this.options.createConversation(
      {
        runtimeId: this.options.runtimeId,
        conversationId: command.conversationId,
        workspacePath: command.workspacePath,
        sessionId,
        initialSnapshot: recoveredSnapshot?.conversation,
        initialActiveTurnSnapshot: recoveredSnapshot?.activeTurn,
        eventBus: this.eventBus,
      },
      command,
    )
    this.conversations.set(conversation.id, conversation)
    await this.recordConversationSnapshot(
      conversation,
      recoveredSnapshot?.activeTurn,
      recoveredSnapshot?.activeExecution,
    )
    if (recoveredSnapshot?.activeExecution && recoveredSnapshot.activeTurn) {
      this.startTurnExecution(
        recoveredSnapshot.activeExecution,
        conversation,
        recoveredSnapshot.activeTurn,
      )
    }
    return this.eventBus.ack({
      requestId: command.requestId,
      conversationId: conversation.id,
      payload: sanitizeWirePayload(conversation.snapshot()),
    })
  }

  private async handleRunTurn(
    command: Extract<KernelRuntimeCommand, { type: 'run_turn' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const conversation = this.requireConversation(
      command.conversationId,
      command.requestId,
    )
    const snapshot = conversation.runTurn({
      turnId: command.turnId,
      prompt: command.prompt,
      attachments: command.attachments,
      metadata: command.metadata,
    })
    await this.recordConversationSnapshot(conversation, snapshot, command)
    this.startTurnExecution(command, conversation, snapshot)
    return this.eventBus.ack({
      requestId: command.requestId,
      conversationId: command.conversationId,
      turnId: command.turnId,
      payload: sanitizeWirePayload(snapshot),
    })
  }

  private async handleAbortTurn(
    command: Extract<KernelRuntimeCommand, { type: 'abort_turn' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const conversation = this.requireConversation(
      command.conversationId,
      command.requestId,
    )
    const snapshot = conversation.abortTurn(command.turnId, command.reason)
    await this.recordConversationSnapshot(conversation, snapshot)
    this.activeExecutions
      .get(this.turnExecutionKey(command.conversationId, command.turnId))
      ?.abort(command.reason ?? 'aborted')
    return this.eventBus.ack({
      requestId: command.requestId,
      conversationId: command.conversationId,
      turnId: command.turnId,
      payload: sanitizeWirePayload(snapshot),
    })
  }

  private handleDecidePermission(
    command: Extract<KernelRuntimeCommand, { type: 'decide_permission' }>,
  ): KernelRuntimeEnvelopeBase {
    if (!this.options.permissionBroker) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Permission broker is not available',
        retryable: false,
      })
    }

    const decision = this.options.permissionBroker.decide(command)
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: sanitizeWirePayload(decision),
    })
  }

  private async handleDisposeConversation(
    command: Extract<KernelRuntimeCommand, { type: 'dispose_conversation' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    const conversation = this.requireConversation(
      command.conversationId,
      command.requestId,
    )
    await conversation.dispose(command.reason)
    await this.recordConversationSnapshot(conversation)
    this.conversations.delete(command.conversationId)
    for (const [key, controller] of this.activeExecutions) {
      if (key.startsWith(`${command.conversationId}:`)) {
        controller.abort(command.reason ?? 'conversation_disposed')
        this.activeExecutions.delete(key)
      }
    }
    return this.eventBus.ack({
      requestId: command.requestId,
      conversationId: command.conversationId,
      payload: { disposed: true },
    })
  }

  private handleSubscribeEvents(
    command: KernelRuntimeSubscribeEventsCommand,
  ): KernelRuntimeEnvelopeBase[] {
    const events = this.eventBus.replay({
      conversationId: command.conversationId,
      turnId: command.turnId,
      sinceEventId: command.sinceEventId,
    })
    const ack = this.eventBus.ack({
      requestId: command.requestId,
      conversationId: command.conversationId,
      turnId: command.turnId,
      payload: { subscribed: true },
    })
    return [ack, ...events]
  }

  private replayRuntimeScopedEvents(
    sinceEventId: string | undefined,
  ): KernelRuntimeEnvelopeBase[] {
    if (!sinceEventId) {
      return []
    }
    return this.eventBus
      .replay({ sinceEventId })
      .filter(envelope => !envelope.conversationId && !envelope.turnId)
  }

  private async requireCapabilityIntent(
    command: KernelRuntimeCreateConversationCommand,
  ): Promise<void> {
    const capabilityNames = getCapabilityIntentNames(command.capabilityIntent)
    if (capabilityNames.length === 0) {
      return
    }
    const resolver = this.options.capabilityResolver
    if (!resolver?.requireCapability) {
      throw new KernelRuntimeWireCapabilityUnavailableError(
        command.requestId,
        capabilityNames,
      )
    }

    await Promise.all(
      capabilityNames.map(name =>
        resolver.requireCapability!(name, {
          cwd: command.workspacePath,
          metadata: sanitizeWirePayload({
            conversationId: command.conversationId,
            sessionId: command.sessionId,
            capabilityIntent: command.capabilityIntent,
            commandMetadata: command.metadata,
          }),
        }),
      ),
    )
    this.eventBus.emit({
      conversationId: command.conversationId,
      type: 'capabilities.required',
      replayable: true,
      payload: sanitizeWirePayload({
        capabilities: capabilityNames,
        descriptors: resolver.listDescriptors(),
      }),
      metadata: command.metadata,
    })
  }

  private assertExistingConversationMatches(
    conversation: KernelRuntimeWireConversation,
    command: KernelRuntimeCreateConversationCommand,
  ): void {
    const snapshot = conversation.snapshot()
    if (snapshot.workspacePath !== command.workspacePath) {
      throw new KernelRuntimeWireConversationConflictError(
        command.requestId,
        command.conversationId,
        'workspacePath',
        {
          existingWorkspacePath: snapshot.workspacePath,
          requestedWorkspacePath: command.workspacePath,
        },
      )
    }
    if (
      command.sessionId !== undefined &&
      snapshot.sessionId !== undefined &&
      command.sessionId !== snapshot.sessionId
    ) {
      throw new KernelRuntimeWireConversationConflictError(
        command.requestId,
        command.conversationId,
        'sessionId',
        {
          existingSessionId: snapshot.sessionId,
          requestedSessionId: command.sessionId,
        },
      )
    }
  }

  private async handleReloadCapabilities(
    command: Extract<KernelRuntimeCommand, { type: 'reload_capabilities' }>,
  ): Promise<KernelRuntimeEnvelopeBase> {
    if (!this.options.capabilityResolver) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'unavailable',
        message: 'Capability resolver is not available',
        retryable: false,
      })
    }

    const descriptors =
      await this.options.capabilityResolver.reloadCapabilities(command.scope, {
        cwd: this.options.workspacePath,
        metadata: command.metadata,
      })
    this.eventBus.emit({
      type: 'capabilities.reloaded',
      replayable: true,
      payload: sanitizeWirePayload({
        scope: command.scope,
        capabilities: command.capabilities,
        descriptors,
      }),
      metadata: command.metadata,
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      payload: {
        descriptors: sanitizeWirePayload(descriptors),
      },
    })
  }

  private handlePublishHostEvent(
    command: Extract<KernelRuntimeCommand, { type: 'publish_host_event' }>,
  ): KernelRuntimeEnvelopeBase {
    const event = this.eventBus.emit({
      ...command.event,
      metadata: {
        ...command.event.metadata,
        publishedBy: 'host',
        requestId: command.requestId,
      },
    })
    return this.eventBus.ack({
      requestId: command.requestId,
      conversationId: event.conversationId,
      turnId: event.turnId,
      eventId: event.eventId,
      payload: {
        published: true,
        eventId: event.eventId,
      },
    })
  }

  private startTurnExecution(
    command: KernelRuntimeRunTurnCommand,
    conversation: KernelRuntimeWireConversation,
    snapshot: KernelTurnSnapshot,
  ): void {
    if (!this.options.runTurnExecutor || snapshot.state !== 'running') {
      return
    }

    const executionKey = this.turnExecutionKey(
      command.conversationId,
      command.turnId,
    )
    if (this.activeExecutions.has(executionKey)) {
      return
    }

    const controller = new AbortController()
    this.activeExecutions.set(executionKey, controller)
    void this.runTurnExecution({
      command,
      conversation,
      eventBus: this.eventBus,
      permissionBroker: this.options.permissionBroker,
      signal: controller.signal,
    }).finally(() => {
      this.activeExecutions.delete(executionKey)
    })
  }

  private async runTurnExecution(
    context: KernelRuntimeWireTurnExecutionContext,
  ): Promise<void> {
    let terminalEmitted = false
    try {
      const result = this.options.runTurnExecutor?.(context)
      if (isAsyncIterable(result)) {
        for await (const event of result) {
          terminalEmitted =
            (await this.handleTurnExecutionEvent(context, event)) ||
            terminalEmitted
        }
      } else {
        await result
      }

      if (!terminalEmitted) {
        await this.completeTurnExecution(context, 'end_turn')
      }
    } catch (error) {
      if (terminalEmitted) {
        return
      }
      if (context.signal.aborted) {
        await this.completeTurnExecution(context, 'aborted')
        return
      }
      await this.failTurnExecution(context, error)
    }
  }

  private async handleTurnExecutionEvent(
    context: KernelRuntimeWireTurnExecutionContext,
    event: KernelRuntimeWireTurnExecutionEvent,
  ): Promise<boolean> {
    switch (event.type) {
      case 'output':
        this.eventBus.emit({
          conversationId: context.command.conversationId,
          turnId: context.command.turnId,
          type: 'turn.output_delta',
          replayable: event.replayable ?? true,
          payload: sanitizeWirePayload(event.payload),
          metadata: event.metadata,
        })
        return false
      case 'event':
        this.eventBus.emit({
          ...event.event,
          conversationId:
            event.event.conversationId ?? context.command.conversationId,
          turnId: event.event.turnId ?? context.command.turnId,
          replayable: event.event.replayable,
          payload: sanitizeWirePayload(event.event.payload),
        })
        return false
      case 'completed':
        await this.completeTurnExecution(
          context,
          event.stopReason ?? 'end_turn',
        )
        return true
      case 'failed':
        await this.failTurnExecution(context, event.error, event.metadata)
        return true
    }
  }

  private async completeTurnExecution(
    context: KernelRuntimeWireTurnExecutionContext,
    stopReason: string | null,
  ): Promise<void> {
    if (context.conversation.activeTurnId !== context.command.turnId) {
      return
    }
    const snapshot = context.conversation.completeTurn(
      context.command.turnId,
      stopReason,
    )
    await this.recordConversationSnapshot(context.conversation, snapshot)
  }

  private async failTurnExecution(
    context: KernelRuntimeWireTurnExecutionContext,
    error: unknown,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (context.conversation.activeTurnId !== context.command.turnId) {
      return
    }
    try {
      const snapshot = context.conversation.failTurn(
        context.command.turnId,
        error,
      )
      await this.recordConversationSnapshot(context.conversation, snapshot)
    } catch (failError) {
      this.eventBus.error({
        requestId: context.command.requestId,
        conversationId: context.command.conversationId,
        turnId: context.command.turnId,
        code: 'internal_error',
        message:
          failError instanceof Error ? failError.message : String(failError),
        retryable: false,
        details: {
          executorError: sanitizeWirePayload(error),
        },
        metadata,
      })
    }
  }

  private turnExecutionKey(
    conversationId: KernelConversationId,
    turnId: KernelTurnId,
  ): string {
    return `${conversationId}:${turnId}`
  }

  private async abortActiveTurnsForHostDisconnect(
    command: KernelRuntimeDisconnectHostCommand,
  ): Promise<KernelTurnId[]> {
    const abortedTurnIds: KernelTurnId[] = []
    const reason = command.reason ?? 'host_disconnected'
    for (const [conversationId, conversation] of this.conversations) {
      const activeTurnId = conversation.activeTurnId
      if (!activeTurnId) {
        continue
      }
      const snapshot = conversation.abortTurn(activeTurnId, reason)
      await this.recordConversationSnapshot(conversation, snapshot)
      this.activeExecutions
        .get(this.turnExecutionKey(conversationId, activeTurnId))
        ?.abort(reason)
      abortedTurnIds.push(activeTurnId)
    }
    return abortedTurnIds
  }

  private async readRecoveredConversation(
    command: KernelRuntimeCreateConversationCommand,
  ): Promise<KernelRuntimeWireConversationRecoverySnapshot | undefined> {
    if (!this.options.conversationSnapshotStore) {
      return undefined
    }

    try {
      const recovered = await this.options.conversationSnapshotStore.readLatest(
        command.conversationId,
      )
      if (!recovered) {
        return undefined
      }
      if (
        command.sessionId !== undefined &&
        recovered.conversation.sessionId !== undefined &&
        command.sessionId !== recovered.conversation.sessionId
      ) {
        return undefined
      }
      const conversation = normalizeRecoveredConversationSnapshot(
        recovered.conversation,
        {
          runtimeId: this.options.runtimeId,
          conversationId: command.conversationId,
          workspacePath: command.workspacePath,
          sessionId: command.sessionId,
        },
      )
      const activeTurn = selectRecoveredActiveTurn(
        conversation,
        recovered.activeTurn,
      )
      const activeExecution = selectRecoveredActiveExecution(
        conversation,
        activeTurn,
        recovered.activeExecution,
      )
      return {
        conversation,
        activeTurn,
        activeExecution,
      }
    } catch (error) {
      this.emitConversationSnapshotFailure(command.conversationId, error, {
        operation: 'readLatest',
      })
      return undefined
    }
  }

  private async recordConversationSnapshot(
    conversation: KernelRuntimeWireConversation,
    activeTurnSnapshot?: KernelTurnSnapshot,
    activeExecution?: KernelRuntimeRunTurnCommand,
  ): Promise<void> {
    if (!this.options.conversationSnapshotStore) {
      return
    }

    const conversationSnapshot = conversation.snapshot()
    const entry = sanitizeWirePayload({
      conversation: conversationSnapshot,
      activeTurn:
        activeTurnSnapshot &&
        conversationSnapshot.activeTurnId === activeTurnSnapshot.turnId
          ? activeTurnSnapshot
          : undefined,
      activeExecution:
        activeExecution &&
        activeTurnSnapshot?.state === 'running' &&
        conversationSnapshot.activeTurnId === activeExecution.turnId &&
        activeTurnSnapshot.turnId === activeExecution.turnId
          ? activeExecution
          : undefined,
    }) as KernelRuntimeWireConversationRecoverySnapshot

    try {
      await this.options.conversationSnapshotStore.append(entry)
    } catch (error) {
      this.emitConversationSnapshotFailure(conversation.id, error, {
        operation: 'append',
      })
    }
  }

  private emitConversationSnapshotFailure(
    conversationId: KernelConversationId,
    error: unknown,
    metadata?: Record<string, unknown>,
  ): void {
    this.eventBus.emit({
      conversationId,
      type: 'conversation.snapshot_failed',
      replayable: false,
      payload: sanitizeWirePayload({
        message: error instanceof Error ? error.message : String(error),
      }),
      metadata,
    })
  }

  private requireConversation(
    conversationId: KernelConversationId,
    requestId: string,
  ): KernelRuntimeWireConversation {
    const conversation = this.conversations.get(conversationId)
    if (!conversation) {
      throw new KernelRuntimeWireNotFoundError(requestId, conversationId)
    }
    return conversation
  }

  private requireHost(
    hostId: string,
    requestId: string,
  ): KernelRuntimeWireHostRecord {
    const host = this.hosts.get(hostId)
    if (!host) {
      throw new KernelRuntimeWireHostNotFoundError(requestId, hostId)
    }
    return host
  }

  private mapError(
    command: KernelRuntimeCommand,
    error: unknown,
  ): KernelRuntimeEnvelopeBase {
    if (error instanceof KernelRuntimeWireNotFoundError) {
      return this.eventBus.error({
        requestId: error.requestId,
        conversationId: error.conversationId,
        code: 'not_found',
        message: `Conversation ${error.conversationId} was not found`,
        retryable: false,
      })
    }
    if (error instanceof KernelRuntimeWireHostNotFoundError) {
      return this.eventBus.error({
        requestId: error.requestId,
        code: 'not_found',
        message: `Host ${error.hostId} was not found`,
        retryable: false,
        details: { hostId: error.hostId },
      })
    }
    if (error instanceof KernelRuntimeWireConversationConflictError) {
      return this.eventBus.error({
        requestId: error.requestId,
        conversationId: error.conversationId,
        code: 'invalid_request',
        message: error.message,
        retryable: false,
        details: error.details,
      })
    }
    if (error instanceof KernelRuntimeWireCapabilityUnavailableError) {
      return this.eventBus.error({
        requestId: error.requestId,
        code: 'unavailable',
        message: error.message,
        retryable: false,
        details: { capabilities: error.capabilityNames },
      })
    }
    if (error instanceof RuntimeConversationBusyError) {
      return this.eventBus.error({
        requestId: command.requestId,
        conversationId: error.conversationId,
        turnId: error.activeTurnId,
        code: 'busy',
        message: error.message,
        retryable: true,
      })
    }
    if (error instanceof RuntimeEventReplayError) {
      return this.eventBus.error({
        requestId: command.requestId,
        conversationId:
          'conversationId' in command ? command.conversationId : undefined,
        code: error.code === 'not_found' ? 'not_found' : 'unavailable',
        message: error.message,
        retryable: error.code === 'expired',
        details: { eventId: error.eventId, replayError: error.code },
      })
    }
    if (isPermissionDecisionNotFoundError(error)) {
      return this.eventBus.error({
        requestId: command.requestId,
        code: 'not_found',
        message: error instanceof Error ? error.message : String(error),
        retryable: false,
        details:
          'permissionRequestId' in command
            ? { permissionRequestId: command.permissionRequestId }
            : undefined,
      })
    }
    return this.eventBus.error({
      requestId: command.requestId,
      conversationId:
        'conversationId' in command ? command.conversationId : undefined,
      turnId: 'turnId' in command ? command.turnId : undefined,
      code: 'internal_error',
      message: error instanceof Error ? error.message : String(error),
      retryable: false,
    })
  }
}

class KernelRuntimeWireHostNotFoundError extends Error {
  constructor(
    readonly requestId: string,
    readonly hostId: string,
  ) {
    super(`Host ${hostId} was not found`)
    this.name = 'KernelRuntimeWireHostNotFoundError'
  }
}

class KernelRuntimeWireNotFoundError extends Error {
  constructor(
    readonly requestId: string,
    readonly conversationId: KernelConversationId,
  ) {
    super(`Conversation ${conversationId} was not found`)
    this.name = 'KernelRuntimeWireNotFoundError'
  }
}

class KernelRuntimeWireConversationConflictError extends Error {
  constructor(
    readonly requestId: string,
    readonly conversationId: KernelConversationId,
    readonly conflictField: string,
    readonly details: Record<string, unknown>,
  ) {
    super(
      `Conversation ${conversationId} already exists with a different ${conflictField}`,
    )
    this.name = 'KernelRuntimeWireConversationConflictError'
  }
}

class KernelRuntimeWireCapabilityUnavailableError extends Error {
  constructor(
    readonly requestId: string,
    readonly capabilityNames: readonly KernelCapabilityName[],
  ) {
    super(
      `Capability resolver cannot load required capabilities: ${capabilityNames.join(', ')}`,
    )
    this.name = 'KernelRuntimeWireCapabilityUnavailableError'
  }
}

function sanitizeWirePayload<T>(value: T): T {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    } as T
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizeWirePayload(item)) as T
  }

  if (value === null || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, sanitizeWirePayload(item)]),
  ) as T
}

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  return (
    typeof value === 'object' && value !== null && Symbol.asyncIterator in value
  )
}

function normalizeRecoveredConversationSnapshot(
  snapshot: KernelConversationSnapshot,
  scope: {
    runtimeId: KernelRuntimeId
    conversationId: KernelConversationId
    workspacePath: string
    sessionId?: string
  },
): KernelConversationSnapshot {
  return sanitizeWirePayload({
    ...snapshot,
    runtimeId: scope.runtimeId,
    conversationId: scope.conversationId,
    workspacePath: scope.workspacePath,
    sessionId: scope.sessionId ?? snapshot.sessionId,
    state: isRuntimeOwnedActiveState(snapshot.state)
      ? 'detached'
      : snapshot.state,
  }) as KernelConversationSnapshot
}

function selectRecoveredActiveTurn(
  conversation: KernelConversationSnapshot,
  activeTurn: KernelTurnSnapshot | undefined,
): KernelTurnSnapshot | undefined {
  if (!conversation.activeTurnId || !activeTurn) {
    return undefined
  }
  if (
    activeTurn.conversationId !== conversation.conversationId ||
    activeTurn.turnId !== conversation.activeTurnId
  ) {
    return undefined
  }
  if (!isActiveTurnState(activeTurn.state)) {
    return undefined
  }
  return activeTurn
}

function selectRecoveredActiveExecution(
  conversation: KernelConversationSnapshot,
  activeTurn: KernelTurnSnapshot | undefined,
  activeExecution: KernelRuntimeRunTurnCommand | undefined,
): KernelRuntimeRunTurnCommand | undefined {
  if (!activeTurn || activeTurn.state !== 'running' || !activeExecution) {
    return undefined
  }
  if (
    activeExecution.type !== 'run_turn' ||
    activeExecution.conversationId !== conversation.conversationId ||
    activeExecution.turnId !== activeTurn.turnId
  ) {
    return undefined
  }
  return activeExecution
}

function isRuntimeOwnedActiveState(
  state: KernelConversationSnapshot['state'],
): boolean {
  return state === 'running' || state === 'aborting'
}

function isActiveTurnState(state: KernelTurnSnapshot['state']): boolean {
  return state === 'starting' || state === 'running' || state === 'aborting'
}

function isPermissionDecisionNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error && error.name === 'RuntimePermissionDecisionError'
  )
}

function getCapabilityIntentNames(
  capabilityIntent: Record<string, unknown> | undefined,
): readonly KernelCapabilityName[] {
  if (!capabilityIntent) {
    return []
  }

  const names = new Set<KernelCapabilityName>()
  for (const key of [
    'capabilities',
    'requiredCapabilities',
    'require',
    'requires',
    'load',
  ]) {
    addCapabilityNames(names, capabilityIntent[key])
  }

  for (const [key, value] of Object.entries(capabilityIntent)) {
    if (value === true) {
      names.add(key)
    }
  }

  return [...names]
}

function addCapabilityNames(
  names: Set<KernelCapabilityName>,
  value: unknown,
): void {
  if (typeof value === 'string') {
    names.add(value)
    return
  }
  if (!Array.isArray(value)) {
    return
  }
  for (const item of value) {
    if (typeof item === 'string') {
      names.add(item)
    }
  }
}

export function createKernelRuntimeWireRouter(
  options: KernelRuntimeWireRouterOptions,
): KernelRuntimeWireRouter {
  return new KernelRuntimeWireRouter(options)
}
