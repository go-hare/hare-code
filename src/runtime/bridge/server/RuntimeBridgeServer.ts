import { RuntimeCore, type RuntimeCoreOptions } from '../../core/index.js'
import type {
  GoalInput,
  HostEvent,
  RuntimeEvent,
  RuntimeState,
  TaskAction,
  TaskControlResult,
  UserInput,
} from '../../types/index.js'
import type {
  RuntimeBridgeCreateSessionOptions,
  RuntimeBridgeEventEnvelope,
  RuntimeBridgeSessionHandle,
  RuntimeBridgeSessionId,
  RuntimeBridgeSessionInfo,
  RuntimeBridgeTransport,
} from '../protocol.js'

export type RuntimeBridgeServerOptions = {
  createRuntime?: (options?: RuntimeCoreOptions) => RuntimeCore
}

type RuntimeBridgeSessionRecord = {
  sessionId: RuntimeBridgeSessionId
  runtime: RuntimeCore
  unsubscribeRuntime: () => void
  queue: RuntimeEvent[]
  listeners: Set<(event: RuntimeBridgeEventEnvelope) => void>
}

function createSessionId(counter: number): RuntimeBridgeSessionId {
  return `runtime_session_${String(counter).padStart(4, '0')}`
}

export class RuntimeBridgeServer implements RuntimeBridgeTransport {
  readonly #sessions = new Map<RuntimeBridgeSessionId, RuntimeBridgeSessionRecord>()
  readonly #createRuntime: (options?: RuntimeCoreOptions) => RuntimeCore
  #sessionCounter = 0

  constructor(options: RuntimeBridgeServerOptions = {}) {
    this.#createRuntime = options.createRuntime || (runtimeOptions => new RuntimeCore(runtimeOptions))
  }

  async createSession(
    options: RuntimeBridgeCreateSessionOptions = {},
  ): Promise<RuntimeBridgeSessionInfo> {
    const sessionId = options.sessionId || this.#nextSessionId()
    const existing = this.#sessions.get(sessionId)
    if (existing) {
      return {
        sessionId,
        state: existing.runtime.getState(),
      }
    }

    const runtime = this.#createRuntime({
      initialConversationId: options.initialConversationId,
    })
    const record: RuntimeBridgeSessionRecord = {
      sessionId,
      runtime,
      queue: [],
      listeners: new Set(),
      unsubscribeRuntime: runtime.onEvent(event => {
        record.queue.push(event)
        const envelope = { sessionId, event }
        for (const listener of record.listeners) {
          listener(envelope)
        }
      }),
    }
    this.#sessions.set(sessionId, record)
    await runtime.start()

    return {
      sessionId,
      state: runtime.getState(),
    }
  }

  async getSession(
    sessionId: RuntimeBridgeSessionId,
  ): Promise<RuntimeBridgeSessionInfo | null> {
    const record = this.#sessions.get(sessionId)
    if (!record) {
      return null
    }

    return {
      sessionId,
      state: record.runtime.getState(),
    }
  }

  async listSessions(): Promise<RuntimeBridgeSessionInfo[]> {
    return [...this.#sessions.values()].map(record => ({
      sessionId: record.sessionId,
      state: record.runtime.getState(),
    }))
  }

  async stopSession(sessionId: RuntimeBridgeSessionId): Promise<boolean> {
    const record = this.#sessions.get(sessionId)
    if (!record) {
      return false
    }

    await record.runtime.stop()
    record.unsubscribeRuntime()
    record.listeners.clear()
    record.queue = []
    this.#sessions.delete(sessionId)
    return true
  }

  async submitInput(
    sessionId: RuntimeBridgeSessionId,
    input: UserInput,
  ): Promise<string> {
    return this.#getRecord(sessionId).runtime.submitInput(input)
  }

  async submitGoal(
    sessionId: RuntimeBridgeSessionId,
    goal: GoalInput,
  ): Promise<string> {
    return this.#getRecord(sessionId).runtime.submitGoal(goal)
  }

  async interrupt(
    sessionId: RuntimeBridgeSessionId,
    turnId?: string,
  ): Promise<boolean> {
    return this.#getRecord(sessionId).runtime.interrupt(turnId)
  }

  async publishHostEvent(
    sessionId: RuntimeBridgeSessionId,
    event: HostEvent,
  ): Promise<void> {
    this.#getRecord(sessionId).runtime.publishHostEvent(event)
  }

  async controlTask(
    sessionId: RuntimeBridgeSessionId,
    taskId: string,
    action: TaskAction,
  ): Promise<TaskControlResult> {
    return this.#getRecord(sessionId).runtime.controlTask(taskId, action)
  }

  async pollEvent(
    sessionId: RuntimeBridgeSessionId,
  ): Promise<RuntimeEvent | null> {
    const record = this.#getRecord(sessionId)
    return record.queue.shift() || null
  }

  async drainEvents(sessionId: RuntimeBridgeSessionId): Promise<RuntimeEvent[]> {
    const record = this.#getRecord(sessionId)
    const events = [...record.queue]
    record.queue = []
    return events
  }

  async waitEvent(
    sessionId: RuntimeBridgeSessionId,
    timeoutMs?: number,
  ): Promise<RuntimeEvent | null> {
    const record = this.#getRecord(sessionId)
    if (record.queue.length > 0) {
      return record.queue.shift() || null
    }
    return record.runtime.waitEvent(timeoutMs)
  }

  async subscribe(
    sessionId: RuntimeBridgeSessionId,
    listener: (envelope: RuntimeBridgeEventEnvelope) => void,
  ): Promise<() => void> {
    const record = this.#getRecord(sessionId)
    record.listeners.add(listener)
    return () => {
      record.listeners.delete(listener)
    }
  }

  createSessionHandle(sessionId: RuntimeBridgeSessionId): RuntimeBridgeSessionHandle {
    const record = this.#getRecord(sessionId)
    return {
      sessionId,
      stop: () => this.stopSession(sessionId).then(() => undefined),
      getState: () => record.runtime.getState(),
      submitInput: (input: UserInput) => record.runtime.submitInput(input),
      submitGoal: (goal: GoalInput) => record.runtime.submitGoal(goal),
      interrupt: (turnId?: string) => record.runtime.interrupt(turnId),
      publishHostEvent: (event: HostEvent) => record.runtime.publishHostEvent(event),
      controlTask: (taskId: string, action: TaskAction) =>
        record.runtime.controlTask(taskId, action),
      pollEvent: () => record.queue.shift() || null,
      drainEvents: () => {
        const events = [...record.queue]
        record.queue = []
        return events
      },
      waitEvent: (timeoutMs?: number) => record.runtime.waitEvent(timeoutMs),
      subscribe: (listener: (event: RuntimeEvent) => void) => {
        const wrapped = ({ event }: RuntimeBridgeEventEnvelope) => listener(event)
        record.listeners.add(wrapped)
        return () => {
          record.listeners.delete(wrapped)
        }
      },
    }
  }

  #nextSessionId(): RuntimeBridgeSessionId {
    this.#sessionCounter += 1
    return createSessionId(this.#sessionCounter)
  }

  #getRecord(sessionId: RuntimeBridgeSessionId): RuntimeBridgeSessionRecord {
    const record = this.#sessions.get(sessionId)
    if (!record) {
      throw new Error(`Runtime bridge session not found: ${sessionId}`)
    }
    return record
  }
}
