import type { RuntimeEvent, RuntimeState, TaskAction, TaskControlResult, TaskState, UserInput } from '../../runtime/types/index.js'
import type { RuntimeHostSession } from '../../sdk/index.js'
import type {
  CliRuntimeHostAdapterOptions,
  CliRuntimeHostListener,
  CliRuntimeHostViewState,
} from './types.js'
import {
  applyCliRuntimeEvent,
  createCliRuntimeHostState,
} from './stateHelpers.js'
import { cloneCliRuntimeHostState } from './stateSnapshot.js'

const DEFAULT_OPTIONS = {
  maxNotifications: 20,
  maxRecentEvents: 50,
}

export class CliRuntimeHostAdapter {
  readonly #session: RuntimeHostSession
  readonly #options: Required<CliRuntimeHostAdapterOptions>

  #state: CliRuntimeHostViewState
  #listeners = new Set<CliRuntimeHostListener>()
  #unsubscribeRuntime?: () => void
  #notificationCounter = 0
  #eventCounter = 0

  constructor(session: RuntimeHostSession, options: CliRuntimeHostAdapterOptions = {}) {
    this.#session = session
    this.#options = {
      ...DEFAULT_OPTIONS,
      ...options,
    }
    this.#state = createCliRuntimeHostState(this.#session.getState())
  }

  connect(): void {
    if (this.#unsubscribeRuntime) {
      return
    }
    this.#state = createCliRuntimeHostState(this.#session.getState())
    this.#unsubscribeRuntime = this.#session.onEvent(event => {
      this.#applyEvent(event)
    })
    this.#emit()
  }

  disconnect(): void {
    this.#unsubscribeRuntime?.()
    this.#unsubscribeRuntime = undefined
  }

  getSnapshot(): CliRuntimeHostViewState {
    return this.#state
  }

  getState(): CliRuntimeHostViewState {
    return cloneCliRuntimeHostState(this.#state)
  }

  subscribe(listener: CliRuntimeHostListener): () => void {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  getRuntimeState(): RuntimeState {
    return this.#session.getState()
  }

  async start(): Promise<void> {
    await this.#session.start()
  }

  async stop(): Promise<void> {
    await this.#session.stop()
  }

  submitInput(input: UserInput): string {
    return this.#session.submitInput(input)
  }

  appendAssistantDelta(runId: string, text: string): boolean {
    return this.#session.appendAssistantDelta(runId, text)
  }

  completeTurn(runId: string, text: string, stopReason?: string): boolean {
    return this.#session.completeTurn(runId, text, stopReason)
  }

  failTurn(runId: string, error: string): boolean {
    return this.#session.failTurn(runId, error)
  }

  async controlTask(
    taskId: string,
    action: TaskAction,
  ): Promise<TaskControlResult> {
    return this.#session.controlTask(taskId, action)
  }

  upsertTask(task: TaskState): void {
    this.#session.upsertTask(task)
  }

  removeTask(taskId: string): void {
    this.#session.removeTask(taskId)
  }

  #applyEvent(event: RuntimeEvent): void {
    this.#state = applyCliRuntimeEvent(this.#state, event, {
      now: Date.now(),
      options: this.#options,
      createEventId: () => this.#nextEventId(),
      createNotificationId: () => this.#nextNotificationId(),
    })
    this.#emit()
  }

  #emit(): void {
    for (const listener of this.#listeners) {
      listener(this.getState())
    }
  }

  #nextNotificationId(): string {
    this.#notificationCounter += 1
    return `runtime_notification_${this.#notificationCounter}`
  }

  #nextEventId(): string {
    this.#eventCounter += 1
    return `runtime_event_${this.#eventCounter}`
  }
}
