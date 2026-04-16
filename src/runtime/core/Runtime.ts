import type {
  CoordinatorModeState,
  GoalInput,
  HostEvent,
  RuntimeEvent,
  RuntimeState,
  RuntimeStateEvent,
  TaskAction,
  TaskControlResult,
  UserInput,
} from '../types/index.js'
import { CoordinatorRuntime } from './CoordinatorRuntime.js'
import { RuntimeEventBus } from './EventBus.js'
import { HostEventAdapter } from './HostEvents.js'
import { QueryRuntime } from './QueryRuntime.js'
import { SessionManager } from './SessionManager.js'
import { TaskRuntime } from './TaskRuntime.js'

export type RuntimeCoreOptions = {
  initialConversationId?: string
  coordinator?: Partial<CoordinatorModeState>
}

export class RuntimeCore {
  readonly eventBus = new RuntimeEventBus()
  readonly sessions: SessionManager
  readonly query: QueryRuntime
  readonly hostEvents: HostEventAdapter
  readonly coordinatorRuntime: CoordinatorRuntime
  readonly taskRuntime: TaskRuntime

  #lifecycle: RuntimeState['lifecycle'] = 'created'
  #activeRunId?: string
  #activeTurnId?: string

  constructor(options: RuntimeCoreOptions = {}) {
    this.sessions = new SessionManager(options.initialConversationId)
    this.query = new QueryRuntime()
    this.hostEvents = new HostEventAdapter(this.sessions)
    this.coordinatorRuntime = new CoordinatorRuntime(options.coordinator)
    this.taskRuntime = new TaskRuntime({
      emitEvent: event => this.eventBus.emit(event),
    })
  }

  getState(): RuntimeState {
    return {
      lifecycle: this.#lifecycle,
      conversationId: this.sessions.activeConversationId,
      activeTurnId: this.#activeTurnId,
      activeRunId: this.#activeRunId,
      activeTaskId: this.taskRuntime.activeTaskId,
      pendingToolRunId: undefined,
      coordinator: this.coordinatorRuntime.getState(),
      tasks: this.listTasks({ includeCompleted: true }),
      metadata: {},
    }
  }

  async start(): Promise<void> {
    if (this.#lifecycle === 'running' || this.#lifecycle === 'starting') {
      return
    }
    this.#lifecycle = 'starting'
    this.#emitState()
    this.#lifecycle = 'running'
    this.#emitState()
  }

  async stop(): Promise<void> {
    if (this.#lifecycle === 'stopped' || this.#lifecycle === 'stopping') {
      return
    }
    this.#lifecycle = 'stopping'
    this.#emitState()
    this.query.clear()
    this.#activeRunId = undefined
    this.#activeTurnId = undefined
    this.taskRuntime.clearActiveTask()
    this.#lifecycle = 'stopped'
    this.#emitState()
  }

  submitInput(input: UserInput): string {
    this.#assertRunning()
    const normalized = this.sessions.beginTurn(input)
    const run = this.query.submit(normalized)
    this.#activeRunId = run.runId
    this.#activeTurnId = run.turnId
    this.#emitState()
    return normalized.turnId
  }

  async interrupt(turnId?: string): Promise<boolean> {
    this.#assertRunning()
    const interrupted = this.query.interrupt(turnId)
    if (!interrupted) {
      return false
    }
    if (this.#activeRunId === interrupted.runId) {
      this.#activeRunId = undefined
    }
    this.#emitState()
    return true
  }

  publishHostEvent(event: HostEvent): void {
    this.#assertRunning()
    const published = this.hostEvents.publish(event)
    this.eventBus.emit(published.runtimeEvent)
  }

  appendAssistantDelta(runId: string, text: string): boolean {
    const event = this.query.appendAssistantDelta(runId, text)
    if (!event) {
      return false
    }
    this.eventBus.emit(event)
    return true
  }

  completeTurn(runId: string, text: string, stopReason?: string): boolean {
    const event = this.query.completeTurn(runId, text, stopReason)
    if (!event) {
      return false
    }
    if (this.#activeRunId === runId) {
      this.#activeRunId = undefined
    }
    if (this.#activeTurnId === event.turnId) {
      this.#activeTurnId = undefined
    }
    this.eventBus.emit(event)
    this.#emitState()
    return true
  }

  failTurn(runId: string, error: string): boolean {
    const event = this.query.failTurn(runId, error)
    if (!event) {
      return false
    }
    if (this.#activeRunId === runId) {
      this.#activeRunId = undefined
    }
    if (this.#activeTurnId === event.turnId) {
      this.#activeTurnId = undefined
    }
    this.eventBus.emit(event)
    this.#emitState()
    return true
  }

  submitGoal(goal: GoalInput): string {
    this.#assertRunning()
    const taskId = this.taskRuntime.submitGoal(
      goal,
      this.sessions.activeConversationId,
    )
    this.#emitState()
    return taskId
  }

  listTasks(options: { includeCompleted?: boolean } = {}) {
    return this.taskRuntime.listTasks(options)
  }

  async controlTask(
    taskId: string,
    action: TaskAction,
  ): Promise<TaskControlResult> {
    this.#assertRunning()
    const result = await this.taskRuntime.controlTask(taskId, action)
    this.#emitState()
    return result
  }

  onEvent(cb: (event: RuntimeEvent) => void): () => void {
    return this.eventBus.subscribe(cb)
  }

  pollEvent(): RuntimeEvent | null {
    return this.eventBus.poll()
  }

  async waitEvent(timeoutMs?: number): Promise<RuntimeEvent | null> {
    return this.eventBus.wait(timeoutMs)
  }

  drainEvents(): RuntimeEvent[] {
    return this.eventBus.drain()
  }

  setCoordinatorMode(state: Partial<CoordinatorModeState>): void {
    this.coordinatorRuntime.update(state)
    this.#emitState()
  }

  #emitState(): void {
    const event: RuntimeStateEvent = {
      type: 'runtime_state',
      conversationId: this.sessions.activeConversationId,
      turnId: this.#activeTurnId,
      runId: this.#activeRunId,
      taskId: this.taskRuntime.activeTaskId,
      state: this.getState(),
    }
    this.eventBus.emit(event)
  }

  #assertRunning(): void {
    if (this.#lifecycle !== 'running') {
      throw new Error(
        `RuntimeCore must be running before use. Current lifecycle: ${this.#lifecycle}`,
      )
    }
  }
}
