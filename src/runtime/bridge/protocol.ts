import type {
  GoalInput,
  HostEvent,
  RuntimeEvent,
  RuntimeState,
  TaskAction,
  TaskControlResult,
  UserInput,
} from '../types/index.js'

export type RuntimeBridgeSessionId = string

export type RuntimeBridgeCreateSessionOptions = {
  sessionId?: RuntimeBridgeSessionId
  initialConversationId?: string
}

export type RuntimeBridgeSessionInfo = {
  sessionId: RuntimeBridgeSessionId
  state: RuntimeState
}

export type RuntimeBridgeEventEnvelope = {
  sessionId: RuntimeBridgeSessionId
  event: RuntimeEvent
}

export type RuntimeBridgeSessionHandle = {
  sessionId: RuntimeBridgeSessionId
  stop(): Promise<void>
  getState(): RuntimeState
  submitInput(input: UserInput): string
  submitGoal(goal: GoalInput): string
  interrupt(turnId?: string): Promise<boolean>
  publishHostEvent(event: HostEvent): void
  controlTask(taskId: string, action: TaskAction): Promise<TaskControlResult>
  pollEvent(): RuntimeEvent | null
  drainEvents(): RuntimeEvent[]
  waitEvent(timeoutMs?: number): Promise<RuntimeEvent | null>
  subscribe(listener: (event: RuntimeEvent) => void): () => void
}

export type RuntimeBridgeTransport = {
  createSession(
    options?: RuntimeBridgeCreateSessionOptions,
  ): Promise<RuntimeBridgeSessionInfo>
  getSession(
    sessionId: RuntimeBridgeSessionId,
  ): Promise<RuntimeBridgeSessionInfo | null>
  listSessions(): Promise<RuntimeBridgeSessionInfo[]>
  stopSession(sessionId: RuntimeBridgeSessionId): Promise<boolean>
  submitInput(
    sessionId: RuntimeBridgeSessionId,
    input: UserInput,
  ): Promise<string>
  submitGoal(
    sessionId: RuntimeBridgeSessionId,
    goal: GoalInput,
  ): Promise<string>
  interrupt(
    sessionId: RuntimeBridgeSessionId,
    turnId?: string,
  ): Promise<boolean>
  publishHostEvent(
    sessionId: RuntimeBridgeSessionId,
    event: HostEvent,
  ): Promise<void>
  controlTask(
    sessionId: RuntimeBridgeSessionId,
    taskId: string,
    action: TaskAction,
  ): Promise<TaskControlResult>
  pollEvent(sessionId: RuntimeBridgeSessionId): Promise<RuntimeEvent | null>
  drainEvents(sessionId: RuntimeBridgeSessionId): Promise<RuntimeEvent[]>
  waitEvent(
    sessionId: RuntimeBridgeSessionId,
    timeoutMs?: number,
  ): Promise<RuntimeEvent | null>
  subscribe(
    sessionId: RuntimeBridgeSessionId,
    listener: (envelope: RuntimeBridgeEventEnvelope) => void,
  ): Promise<() => void>
}
