import type {
  GoalInput,
  HostEvent,
  RuntimeEvent,
  TaskAction,
  TaskControlResult,
  UserInput,
} from '../../types/index.js'
import type {
  RuntimeBridgeCreateSessionOptions,
  RuntimeBridgeSessionHandle,
  RuntimeBridgeSessionId,
  RuntimeBridgeSessionInfo,
  RuntimeBridgeTransport,
} from '../protocol.js'

export class RuntimeBridgeClient {
  readonly #transport: RuntimeBridgeTransport
  readonly #sessionId: RuntimeBridgeSessionId

  constructor(transport: RuntimeBridgeTransport, sessionId: RuntimeBridgeSessionId) {
    this.#transport = transport
    this.#sessionId = sessionId
  }

  get sessionId(): RuntimeBridgeSessionId {
    return this.#sessionId
  }

  static async create(
    transport: RuntimeBridgeTransport,
    options?: RuntimeBridgeCreateSessionOptions,
  ): Promise<RuntimeBridgeClient> {
    const session = await transport.createSession(options)
    return new RuntimeBridgeClient(transport, session.sessionId)
  }

  async getSession(): Promise<RuntimeBridgeSessionInfo | null> {
    return this.#transport.getSession(this.#sessionId)
  }

  async submitInput(input: UserInput): Promise<string> {
    return this.#transport.submitInput(this.#sessionId, input)
  }

  async submitGoal(goal: GoalInput): Promise<string> {
    return this.#transport.submitGoal(this.#sessionId, goal)
  }

  async interrupt(turnId?: string): Promise<boolean> {
    return this.#transport.interrupt(this.#sessionId, turnId)
  }

  async publishHostEvent(event: HostEvent): Promise<void> {
    return this.#transport.publishHostEvent(this.#sessionId, event)
  }

  async controlTask(
    taskId: string,
    action: TaskAction,
  ): Promise<TaskControlResult> {
    return this.#transport.controlTask(this.#sessionId, taskId, action)
  }

  async pollEvent(): Promise<RuntimeEvent | null> {
    return this.#transport.pollEvent(this.#sessionId)
  }

  async drainEvents(): Promise<RuntimeEvent[]> {
    return this.#transport.drainEvents(this.#sessionId)
  }

  async waitEvent(timeoutMs?: number): Promise<RuntimeEvent | null> {
    return this.#transport.waitEvent(this.#sessionId, timeoutMs)
  }

  async subscribe(
    listener: (event: RuntimeEvent) => void,
  ): Promise<() => void> {
    return this.#transport.subscribe(this.#sessionId, envelope => {
      listener(envelope.event)
    })
  }

  async stop(): Promise<boolean> {
    return this.#transport.stopSession(this.#sessionId)
  }
}

export async function createRuntimeBridgeSession(
  transport: RuntimeBridgeTransport,
  options?: RuntimeBridgeCreateSessionOptions,
): Promise<RuntimeBridgeSessionHandle> {
  const session = await transport.createSession(options)
  const client = new RuntimeBridgeClient(transport, session.sessionId)

  return {
    sessionId: session.sessionId,
    stop: async () => {
      await client.stop()
    },
    getState: () => {
      throw new Error(
        'RuntimeBridgeSessionHandle.getState() is not available on the generic client handle. Use getSession() instead.',
      )
    },
    submitInput: (input: UserInput) => {
      throw new Error(
        `RuntimeBridgeSessionHandle.submitInput() is not available synchronously for remote transports. Use RuntimeBridgeClient.submitInput() for session ${session.sessionId}.`,
      )
    },
    submitGoal: (goal: GoalInput) => {
      throw new Error(
        `RuntimeBridgeSessionHandle.submitGoal() is not available synchronously for remote transports. Use RuntimeBridgeClient.submitGoal() for session ${session.sessionId}.`,
      )
    },
    interrupt: (turnId?: string) => client.interrupt(turnId),
    publishHostEvent: (event: HostEvent) => {
      void client.publishHostEvent(event)
    },
    controlTask: (taskId: string, action: TaskAction) =>
      client.controlTask(taskId, action),
    pollEvent: () => {
      throw new Error(
        'RuntimeBridgeSessionHandle.pollEvent() is not available synchronously for remote transports. Use RuntimeBridgeClient.pollEvent().',
      )
    },
    drainEvents: () => {
      throw new Error(
        'RuntimeBridgeSessionHandle.drainEvents() is not available synchronously for remote transports. Use RuntimeBridgeClient.drainEvents().',
      )
    },
    waitEvent: (timeoutMs?: number) => client.waitEvent(timeoutMs),
    subscribe: listener => {
      throw new Error(
        'RuntimeBridgeSessionHandle.subscribe() is not available synchronously for remote transports. Use RuntimeBridgeClient.subscribe().',
      )
    },
  }
}
