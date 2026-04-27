import type {
  KernelConversationId,
  KernelConversationSnapshot,
} from '../../../contracts/conversation.js'
import type {
  KernelRuntimeEnvelopeBase,
  KernelRuntimeEventSink,
} from '../../../contracts/events.js'
import type { KernelRuntimeId } from '../../../contracts/runtime.js'
import type {
  KernelTurnId,
  KernelTurnRunRequest,
  KernelTurnSnapshot,
} from '../../../contracts/turn.js'
import { RuntimeConversation } from '../../../core/conversation/RuntimeConversation.js'
import { RuntimeEventBus } from '../../../core/events/RuntimeEventBus.js'

export type HeadlessConversationAdapterOptions = {
  runtimeId: KernelRuntimeId
  conversationId: KernelConversationId
  workspacePath: string
  sessionId?: string
  initialSnapshot?: KernelConversationSnapshot
  initialActiveTurnSnapshot?: KernelTurnSnapshot
  eventBus?: RuntimeEventBus
  runtimeEventSink?: KernelRuntimeEventSink
}

export type HeadlessConversationRunTurnRequest = Omit<
  KernelTurnRunRequest,
  'conversationId'
>

export type HeadlessConversation = {
  readonly id: KernelConversationId
  readonly eventBus: RuntimeEventBus
  readonly activeTurnId: KernelTurnId | undefined
  snapshot(): KernelConversationSnapshot
  runTurn(request: HeadlessConversationRunTurnRequest): KernelTurnSnapshot
  startTurn(request: HeadlessConversationRunTurnRequest): KernelTurnSnapshot
  abortTurn(turnId: KernelTurnId, reason?: unknown): KernelTurnSnapshot
  abortActiveTurn(reason?: unknown): KernelTurnSnapshot | undefined
  completeTurn(
    turnId: KernelTurnId,
    stopReason?: string | null,
  ): KernelTurnSnapshot
  failTurn(turnId: KernelTurnId, error: unknown): KernelTurnSnapshot
  dispose(reason?: string): Promise<void>
}

export class HeadlessConversationAdapter implements HeadlessConversation {
  readonly eventBus: RuntimeEventBus
  private readonly conversation: RuntimeConversation
  private readonly unsubscribe?: () => void
  private readonly startedTurnIds = new Set<KernelTurnId>()
  private readonly abortedTurnIds = new Set<KernelTurnId>()
  private currentActiveTurnId: KernelTurnId | undefined

  constructor(options: HeadlessConversationAdapterOptions) {
    this.eventBus =
      options.eventBus ??
      new RuntimeEventBus({
        runtimeId: options.runtimeId,
      })
    this.unsubscribe = options.runtimeEventSink
      ? this.eventBus.subscribe(options.runtimeEventSink)
      : undefined
    this.conversation = new RuntimeConversation({
      runtimeId: options.runtimeId,
      conversationId: options.conversationId,
      workspacePath: options.workspacePath,
      sessionId: options.sessionId,
      initialSnapshot: options.initialSnapshot,
      initialActiveTurnSnapshot: options.initialActiveTurnSnapshot,
    })
    if (options.initialActiveTurnSnapshot) {
      this.startedTurnIds.add(options.initialActiveTurnSnapshot.turnId)
      if (options.initialActiveTurnSnapshot.state === 'aborting') {
        this.abortedTurnIds.add(options.initialActiveTurnSnapshot.turnId)
      }
      if (
        options.initialActiveTurnSnapshot.state === 'running' ||
        options.initialActiveTurnSnapshot.state === 'aborting'
      ) {
        this.currentActiveTurnId = options.initialActiveTurnSnapshot.turnId
      }
    }
    this.emitConversationEvent(
      options.initialSnapshot ? 'conversation.recovered' : 'conversation.ready',
    )
  }

  get id(): KernelConversationId {
    return this.conversation.id
  }

  get activeTurnId(): KernelTurnId | undefined {
    return this.currentActiveTurnId
  }

  snapshot(): KernelConversationSnapshot {
    return this.conversation.snapshot()
  }

  runTurn(request: HeadlessConversationRunTurnRequest): KernelTurnSnapshot {
    return this.startTurn(request)
  }

  startTurn(request: HeadlessConversationRunTurnRequest): KernelTurnSnapshot {
    const turn = this.conversation.startTurn({
      ...request,
      conversationId: this.id,
    })
    const snapshot = turn.snapshot()
    this.currentActiveTurnId = snapshot.turnId
    if (!this.startedTurnIds.has(snapshot.turnId)) {
      this.startedTurnIds.add(snapshot.turnId)
      this.emitTurnEvent('turn.started', snapshot)
    }
    return snapshot
  }

  abortTurn(turnId: KernelTurnId, reason?: unknown): KernelTurnSnapshot {
    const snapshot = this.conversation.abortTurn({
      conversationId: this.id,
      turnId,
      reason: normalizeReason(reason),
    })
    if (snapshot.state === 'aborting' && !this.abortedTurnIds.has(turnId)) {
      this.abortedTurnIds.add(turnId)
      this.emitTurnEvent('turn.abort_requested', snapshot)
    }
    return snapshot
  }

  abortActiveTurn(reason?: unknown): KernelTurnSnapshot | undefined {
    if (!this.currentActiveTurnId) {
      return undefined
    }
    return this.abortTurn(this.currentActiveTurnId, reason)
  }

  completeTurn(
    turnId: KernelTurnId,
    stopReason: string | null = null,
  ): KernelTurnSnapshot {
    const snapshot = this.conversation.completeActiveTurn(turnId, stopReason)
    this.currentActiveTurnId = undefined
    this.emitTurnEvent('turn.completed', snapshot)
    return snapshot
  }

  failTurn(turnId: KernelTurnId, error: unknown): KernelTurnSnapshot {
    const snapshot = this.conversation.failActiveTurn(turnId, error)
    this.currentActiveTurnId = undefined
    this.emitTurnEvent('turn.failed', snapshot)
    return snapshot
  }

  async dispose(reason = 'Headless conversation disposed'): Promise<void> {
    await this.conversation.dispose(reason)
    this.emitConversationEvent('conversation.disposed', { reason })
    this.unsubscribe?.()
  }

  private emitConversationEvent(
    type: string,
    payload: unknown = sanitizeConversationSnapshot(
      this.conversation.snapshot(),
    ),
  ): KernelRuntimeEnvelopeBase {
    return this.eventBus.emit({
      conversationId: this.id,
      type,
      replayable: true,
      payload,
    })
  }

  private emitTurnEvent(
    type: string,
    snapshot: KernelTurnSnapshot,
  ): KernelRuntimeEnvelopeBase {
    return this.eventBus.emit({
      conversationId: this.id,
      turnId: snapshot.turnId,
      type,
      replayable: true,
      payload: sanitizeTurnSnapshot(snapshot),
    })
  }
}

function normalizeReason(reason: unknown): string | undefined {
  if (reason === undefined) {
    return undefined
  }
  if (typeof reason === 'string') {
    return reason
  }
  if (reason instanceof Error) {
    return reason.message
  }
  return String(reason)
}

function sanitizeTurnSnapshot(
  snapshot: KernelTurnSnapshot,
): KernelTurnSnapshot {
  return dropUndefined({
    ...snapshot,
    error:
      snapshot.error instanceof Error
        ? {
            name: snapshot.error.name,
            message: snapshot.error.message,
          }
        : snapshot.error === undefined
          ? undefined
          : typeof snapshot.error === 'object' && snapshot.error !== null
            ? snapshot.error
            : String(snapshot.error),
  })
}

function sanitizeConversationSnapshot(
  snapshot: KernelConversationSnapshot,
): KernelConversationSnapshot {
  return dropUndefined(snapshot)
}

function dropUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T
}

export function createHeadlessConversationAdapter(
  options: HeadlessConversationAdapterOptions,
): HeadlessConversationAdapter {
  return new HeadlessConversationAdapter(options)
}

export function createHeadlessConversation(
  options: HeadlessConversationAdapterOptions,
): HeadlessConversation {
  return createHeadlessConversationAdapter(options)
}
