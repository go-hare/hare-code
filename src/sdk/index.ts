import {
  RuntimeBridgeClient,
  RuntimeBridgeServer,
  type RuntimeBridgeCreateSessionOptions,
  type RuntimeBridgeSessionHandle,
  type RuntimeBridgeSessionInfo,
  type RuntimeBridgeTransport,
} from '../runtime/bridge/index.js'
import { RuntimeCore, type RuntimeCoreOptions } from '../runtime/core/index.js'
import type { RuntimeBridgeServerOptions } from '../runtime/bridge/server/RuntimeBridgeServer.js'
import type {
  GoalInput,
  HostEvent,
  RuntimeEvent,
  RuntimeState,
  TaskAction,
  TaskControlResult,
  TaskState,
  UserInput,
} from '../runtime/types/index.js'
import {
  createHeadlessChatSession,
  type CreateHeadlessChatSessionOptions,
  type HeadlessChatSession,
  type HeadlessSessionProvider,
} from './headlessSession.js'

export * from '../runtime/index.js'
export { EXIT_REASONS, HOOK_EVENTS } from './types.js'
export type * from './types.js'
export {
  createHeadlessChatSession,
  type CreateHeadlessChatSessionOptions,
  type HeadlessChatSession,
  type HeadlessSessionProvider,
}

export type CreateRuntimeServerOptions = RuntimeBridgeServerOptions

export type CreateRuntimeClientOptions = RuntimeBridgeCreateSessionOptions

export type CreateInMemoryRuntimeOptions = {
  server?: CreateRuntimeServerOptions
  session?: RuntimeBridgeCreateSessionOptions
}

export type InMemoryRuntimeBundle = {
  server: RuntimeBridgeServer
  client: RuntimeBridgeClient
  handle: RuntimeBridgeSessionHandle
  session: RuntimeBridgeSessionInfo
}

export type RuntimeHostSession = {
  start(): Promise<void>
  stop(): Promise<void>
  getState(): RuntimeState
  onEvent(cb: (event: RuntimeEvent) => void): () => void
  submitInput(input: UserInput): string
  submitGoal(goal: GoalInput): string
  interrupt(turnId?: string): Promise<boolean>
  publishHostEvent(event: HostEvent): void
  controlTask(taskId: string, action: TaskAction): Promise<TaskControlResult>
  appendAssistantDelta(runId: string, text: string): boolean
  completeTurn(runId: string, text: string, stopReason?: string): boolean
  failTurn(runId: string, error: string): boolean
  upsertTask(task: TaskState): void
  removeTask(taskId: string): void
}

export type CreateRuntimeHostSessionOptions = RuntimeCoreOptions

export function createRuntimeServer(
  options: CreateRuntimeServerOptions = {},
): RuntimeBridgeServer {
  return new RuntimeBridgeServer(options)
}

export function attachRuntimeClient(
  transport: RuntimeBridgeTransport,
  sessionId: string,
): RuntimeBridgeClient {
  return new RuntimeBridgeClient(transport, sessionId)
}

export async function createRuntimeClient(
  transport: RuntimeBridgeTransport,
  options?: CreateRuntimeClientOptions,
): Promise<RuntimeBridgeClient> {
  return RuntimeBridgeClient.create(transport, options)
}

export async function createInMemoryRuntime(
  options: CreateInMemoryRuntimeOptions = {},
): Promise<InMemoryRuntimeBundle> {
  const server = createRuntimeServer(options.server)
  const session = await server.createSession(options.session)
  const client = attachRuntimeClient(server, session.sessionId)
  const handle = server.createSessionHandle(session.sessionId)

  return {
    server,
    client,
    handle,
    session,
  }
}

export function createRuntimeHostSession(
  options: CreateRuntimeHostSessionOptions = {},
): RuntimeHostSession {
  const runtime = new RuntimeCore(options)

  return {
    start: () => runtime.start(),
    stop: () => runtime.stop(),
    getState: () => runtime.getState(),
    onEvent: cb => runtime.onEvent(cb),
    submitInput: input => runtime.submitInput(input),
    submitGoal: goal => runtime.submitGoal(goal),
    interrupt: turnId => runtime.interrupt(turnId),
    publishHostEvent: event => runtime.publishHostEvent(event),
    controlTask: (taskId, action) => runtime.controlTask(taskId, action),
    appendAssistantDelta: (runId, text) => runtime.appendAssistantDelta(runId, text),
    completeTurn: (runId, text, stopReason) =>
      runtime.completeTurn(runId, text, stopReason),
    failTurn: (runId, error) => runtime.failTurn(runId, error),
    upsertTask: task => runtime.taskRuntime.upsertTask(task),
    removeTask: taskId => runtime.taskRuntime.removeTask(taskId),
  }
}

export function createRuntimeCoreOptions(
  options: RuntimeCoreOptions = {},
): RuntimeCoreOptions {
  return {
    ...options,
  }
}
