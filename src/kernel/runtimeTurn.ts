import type {
  KernelTurnId,
  KernelTurnSnapshot,
} from '../runtime/contracts/turn.js'
import type {
  KernelAbortTurnOptions,
  KernelRuntimeEventReplayOptions,
  KernelTurn,
  KernelTurnEventReplayOptions,
  KernelWaitForTurnOptions,
} from './runtime.js'
import type { KernelRuntimeWireClient } from './wireProtocol.js'
import {
  collectKernelRuntimeEventEnvelopes,
  isKernelRuntimeEventEnvelope,
  type KernelRuntimeEventEnvelope,
  type KernelRuntimeEventHandler,
} from './runtimeEvents.js'
import { collectReplayEvents, expectPayload } from './runtimeEnvelope.js'
import { waitForTerminalTurn } from './runtimeTurnWait.js'

export function createKernelTurnFacade(options: {
  client: KernelRuntimeWireClient
  snapshot: KernelTurnSnapshot
  onSnapshot?(snapshot: KernelTurnSnapshot): void
}): KernelTurn {
  return new KernelTurnFacade(options)
}

class KernelTurnFacade implements KernelTurn {
  private currentSnapshot: KernelTurnSnapshot

  constructor(
    private readonly options: {
      client: KernelRuntimeWireClient
      snapshot: KernelTurnSnapshot
      onSnapshot?(snapshot: KernelTurnSnapshot): void
    },
  ) {
    this.currentSnapshot = options.snapshot
  }

  get id(): KernelTurnId {
    return this.currentSnapshot.turnId
  }

  get conversationId(): string {
    return this.currentSnapshot.conversationId
  }

  snapshot(): KernelTurnSnapshot {
    return this.currentSnapshot
  }

  async wait(
    options: KernelWaitForTurnOptions = {},
  ): Promise<KernelTurnSnapshot> {
    const snapshot = await waitForTerminalTurn(this.options.client, {
      ...options,
      conversationId: this.conversationId,
      turnId: this.id,
    })
    this.updateSnapshot(snapshot)
    return snapshot
  }

  async abort(
    options: KernelAbortTurnOptions = {},
  ): Promise<KernelTurnSnapshot> {
    const snapshot = expectPayload<KernelTurnSnapshot>(
      await this.options.client.abortTurn({
        type: 'abort_turn',
        conversationId: this.conversationId,
        turnId: this.id,
        reason: options.reason,
        metadata: options.metadata,
      }),
    )
    this.updateSnapshot(snapshot)
    return snapshot
  }

  onEvent(handler: KernelRuntimeEventHandler): () => void {
    return this.options.client.onEvent(envelope => {
      if (
        isKernelRuntimeEventEnvelope(envelope) &&
        envelope.conversationId === this.conversationId &&
        envelope.turnId === this.id
      ) {
        handler(envelope)
      }
    })
  }

  async replayEvents(
    options: KernelTurnEventReplayOptions = {},
  ): Promise<KernelRuntimeEventEnvelope[]> {
    const replayOptions: KernelRuntimeEventReplayOptions = {
      ...options,
      conversationId: this.conversationId,
      turnId: this.id,
    }
    return collectKernelRuntimeEventEnvelopes(
      await collectReplayEvents(this.options.client, replayOptions),
    )
  }

  private updateSnapshot(snapshot: KernelTurnSnapshot): void {
    this.currentSnapshot = snapshot
    this.options.onSnapshot?.(snapshot)
  }
}
