export type KernelJsonSchema = Record<string, unknown>

export type KernelHeadlessState = Record<string, unknown>

export type KernelCommand = {
  name: string
  [key: string]: unknown
}

export type KernelTool = {
  name?: string
  [key: string]: unknown
}

export type KernelAgentDefinition = {
  agentType: string
  [key: string]: unknown
}

export type KernelMcpServerConfig = {
  type?: string
  scope?: string
  [key: string]: unknown
}

export type KernelMcpServerConnection = {
  name: string
  type: string
  config: KernelMcpServerConfig
  [key: string]: unknown
}

export type KernelToolPermissionContext = {
  mode: string
  [key: string]: unknown
}

export type KernelThinkingConfig = Record<string, unknown>

export type KernelHeadlessInput = string | AsyncIterable<string>

export type KernelRuntimeEnvelopeKind = 'ack' | 'event' | 'error' | 'pong'

export type KernelRuntimeErrorCode =
  | 'invalid_request'
  | 'schema_mismatch'
  | 'not_found'
  | 'busy'
  | 'permission_denied'
  | 'aborted'
  | 'unavailable'
  | 'internal_error'

export type KernelRuntimeErrorPayload = {
  code: KernelRuntimeErrorCode
  message: string
  retryable: boolean
  details?: Record<string, unknown>
}

export type KernelRuntimeEnvelopeBase<TPayload = unknown> = {
  schemaVersion: 'kernel.runtime.v1'
  messageId: string
  requestId?: string
  eventId?: string
  sequence: number
  timestamp: string
  source: 'kernel_runtime'
  kind: KernelRuntimeEnvelopeKind
  runtimeId?: string
  conversationId?: string
  turnId?: string
  payload?: TPayload
  error?: KernelRuntimeErrorPayload
  metadata?: Record<string, unknown>
}

export type KernelRuntimeEventSink = (
  envelope: KernelRuntimeEnvelopeBase,
) => void

export type KernelRuntimeEventMessage = {
  type: 'kernel_runtime_event'
  envelope: KernelRuntimeEnvelopeBase
  uuid: string
  session_id: string
}

export type KernelEvent = {
  runtimeId?: string
  conversationId?: string
  turnId?: string
  type: string
  eventId?: string
  replayable: boolean
  payload?: unknown
  metadata?: Record<string, unknown>
}

export type KernelRuntimeEventInput = Omit<
  KernelEvent,
  'runtimeId' | 'eventId'
> &
  Partial<Pick<KernelEvent, 'runtimeId' | 'eventId'>>

export type KernelRuntimeEventReplayRequest = {
  sinceEventId?: string
  conversationId?: string
  turnId?: string
}

export type KernelRuntimeEventFacadeOptions = {
  runtimeId: string
  maxReplayEvents?: number
  initialReplayEnvelopes?: readonly KernelRuntimeEnvelopeBase<KernelEvent>[]
  onEvent?: KernelRuntimeEventSink
  now?: () => string
  createMessageId?: () => string
}

export type KernelRuntimeEventFacade = {
  emit(event: KernelRuntimeEventInput): KernelRuntimeEnvelopeBase<KernelEvent>
  ingestEnvelope(envelope: KernelRuntimeEnvelopeBase): boolean
  ingestMessage(message: unknown): KernelRuntimeEnvelopeBase | undefined
  subscribe(handler: KernelRuntimeEventSink): () => void
  replay(
    request?: KernelRuntimeEventReplayRequest,
  ): Array<KernelRuntimeEnvelopeBase<KernelEvent>>
}

export type KernelRuntimeEventReplayErrorCode = 'expired' | 'not_found'

export declare class KernelRuntimeEventReplayError extends Error {
  readonly code: KernelRuntimeEventReplayErrorCode
  readonly eventId: string
  constructor(code: KernelRuntimeEventReplayErrorCode, eventId: string)
}

export declare function createKernelRuntimeEventFacade(
  options: KernelRuntimeEventFacadeOptions,
): KernelRuntimeEventFacade

export declare function getKernelRuntimeEnvelopeFromMessage(
  message: unknown,
): KernelRuntimeEnvelopeBase | undefined

export declare function toKernelRuntimeEventMessage(
  envelope: KernelRuntimeEnvelopeBase,
  sessionId: string,
): KernelRuntimeEventMessage

export declare function consumeKernelRuntimeEventMessage(
  message: unknown,
  sink?: KernelRuntimeEventSink,
): boolean

export declare function isKernelRuntimeEnvelope(
  value: unknown,
): value is KernelRuntimeEnvelopeBase

export declare function getKernelEventFromEnvelope(
  envelope: KernelRuntimeEnvelopeBase,
): KernelEvent | undefined

export type KernelRuntimeHostKind =
  | 'cli'
  | 'desktop'
  | 'daemon'
  | 'remote'
  | 'worker'
  | 'sdk'
  | 'robot'
  | 'test'

export type KernelRuntimeTransportKind =
  | 'in-process'
  | 'stdio'
  | 'ipc'
  | 'websocket'
  | 'http'
  | 'unix-socket'

export type KernelRuntimeTrustLevel =
  | 'first-party'
  | 'workspace'
  | 'local'
  | 'remote'
  | 'untrusted'

export type KernelRuntimeHostIdentity = {
  kind: KernelRuntimeHostKind
  id: string
  transport: KernelRuntimeTransportKind
  trustLevel: KernelRuntimeTrustLevel
  declaredCapabilities: readonly string[]
  metadata?: Record<string, unknown>
}

export type KernelCapabilityName = string

export type KernelCapabilityStatus =
  | 'declared'
  | 'loading'
  | 'ready'
  | 'degraded'
  | 'failed'
  | 'disabled'

export type KernelCapabilityError = {
  code: string
  message: string
  retryable: boolean
  details?: Record<string, unknown>
}

export type KernelCapabilityDescriptor = {
  name: KernelCapabilityName
  status: KernelCapabilityStatus
  lazy: boolean
  dependencies: readonly KernelCapabilityName[]
  reloadable: boolean
  error?: KernelCapabilityError
  metadata?: Record<string, unknown>
}

export type KernelCapabilityReloadScope =
  | { type: 'capability'; name: KernelCapabilityName }
  | { type: 'dependency-closure'; name: KernelCapabilityName }
  | { type: 'workspace' }
  | { type: 'runtime' }

export declare const KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION: 'kernel.runtime.command.v1'

export type KernelRuntimeCommandType =
  | 'init_runtime'
  | 'connect_host'
  | 'disconnect_host'
  | 'create_conversation'
  | 'run_turn'
  | 'abort_turn'
  | 'decide_permission'
  | 'dispose_conversation'
  | 'reload_capabilities'
  | 'publish_host_event'
  | 'subscribe_events'
  | 'ping'

export type KernelRuntimeCommandBase<TType extends KernelRuntimeCommandType> = {
  schemaVersion: typeof KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION
  type: TType
  requestId: string
  metadata?: Record<string, unknown>
}

export type KernelRuntimeInitCommand =
  KernelRuntimeCommandBase<'init_runtime'> & {
    host?: KernelRuntimeHostIdentity
    workspacePath?: string
    provider?: Record<string, unknown>
    auth?: Record<string, unknown>
    model?: string
    capabilities?: Record<string, unknown>
  }

export type KernelRuntimeHostDisconnectPolicy =
  | 'detach'
  | 'continue'
  | 'abort_active_turns'

export type KernelRuntimeConnectHostCommand =
  KernelRuntimeCommandBase<'connect_host'> & {
    host: KernelRuntimeHostIdentity
    sinceEventId?: string
  }

export type KernelRuntimeDisconnectHostCommand =
  KernelRuntimeCommandBase<'disconnect_host'> & {
    hostId: string
    reason?: string
    policy?: KernelRuntimeHostDisconnectPolicy
  }

export type KernelRuntimeCreateConversationCommand =
  KernelRuntimeCommandBase<'create_conversation'> & {
    conversationId: string
    workspacePath: string
    sessionId?: string
    sessionMeta?: Record<string, unknown>
    capabilityIntent?: Record<string, unknown>
  }

export type KernelRuntimeRunTurnCommand =
  KernelRuntimeCommandBase<'run_turn'> & {
    conversationId: string
    turnId: string
    prompt: string | readonly unknown[]
    attachments?: readonly unknown[]
  }

export type KernelRuntimeAbortTurnCommand =
  KernelRuntimeCommandBase<'abort_turn'> & {
    conversationId: string
    turnId: string
    reason?: string
  }

export type KernelPermissionDecisionValue =
  | 'allow'
  | 'deny'
  | 'allow_once'
  | 'allow_session'
  | 'abort'

export type KernelPermissionDecisionSource =
  | 'host'
  | 'policy'
  | 'timeout'
  | 'runtime'

export type KernelPermissionRequestId = string

export type KernelPermissionRisk =
  | 'low'
  | 'medium'
  | 'high'
  | 'destructive'

export type KernelPermissionRequest = {
  permissionRequestId: KernelPermissionRequestId
  conversationId: string
  turnId?: string
  toolName: string
  action: string
  argumentsPreview: unknown
  risk: KernelPermissionRisk
  policySnapshot: Record<string, unknown>
  timeoutMs?: number
  metadata?: Record<string, unknown>
}

export type KernelPermissionDecision = {
  permissionRequestId: KernelPermissionRequestId
  decision: KernelPermissionDecisionValue
  decidedBy: KernelPermissionDecisionSource
  reason?: string
  expiresAt?: string
  metadata?: Record<string, unknown>
}

export type KernelPermissionDecisionHandler = (
  request: KernelPermissionRequest,
  signal: KernelRuntimeWireAbortSignal,
) => Promise<KernelPermissionDecision> | KernelPermissionDecision

export type KernelPermissionSessionGrantKeyFactory = (
  request: KernelPermissionRequest,
) => string

export type KernelPermissionBrokerSnapshot = {
  pendingRequestIds: string[]
  finalizedRequestIds: string[]
  sessionGrantCount: number
  disposed: boolean
}

export type KernelPermissionBroker = {
  requestPermission(
    request: KernelPermissionRequest,
  ): Promise<KernelPermissionDecision>
  decide(decision: KernelPermissionDecision): KernelPermissionDecision
  dispose(reason?: string): void
  snapshot(): KernelPermissionBrokerSnapshot
}

export type KernelPermissionBrokerOptions = {
  runtimeId?: string
  maxReplayEvents?: number
  eventSink?: KernelRuntimeEventSink
  decide?: KernelPermissionDecisionHandler
  defaultTimeoutMs?: number
  timeoutDecision?: Extract<KernelPermissionDecisionValue, 'deny' | 'abort'>
  now?: () => string
  createMessageId?: () => string
  createSessionGrantKey?: KernelPermissionSessionGrantKeyFactory
}

export declare class KernelPermissionBrokerDisposedError extends Error {}

export declare class KernelPermissionDecisionError extends Error {
  readonly permissionRequestId: string
  constructor(permissionRequestId: string)
}

export declare function createKernelPermissionBroker(
  options?: KernelPermissionBrokerOptions,
): KernelPermissionBroker

export type KernelRuntimeDecidePermissionCommand =
  KernelRuntimeCommandBase<'decide_permission'> & KernelPermissionDecision

export type KernelRuntimeDisposeConversationCommand =
  KernelRuntimeCommandBase<'dispose_conversation'> & {
    conversationId: string
    reason?: string
  }

export type KernelRuntimeReloadCapabilitiesCommand =
  KernelRuntimeCommandBase<'reload_capabilities'> & {
    scope: KernelCapabilityReloadScope
    capabilities?: readonly string[]
  }

export type KernelRuntimePublishHostEventCommand =
  KernelRuntimeCommandBase<'publish_host_event'> & {
    event: KernelEvent
  }

export type KernelRuntimeSubscribeEventsCommand =
  KernelRuntimeCommandBase<'subscribe_events'> & {
    conversationId?: string
    turnId?: string
    sinceEventId?: string
    filters?: Record<string, unknown>
  }

export type KernelRuntimePingCommand = KernelRuntimeCommandBase<'ping'>

export type KernelRuntimeCommand =
  | KernelRuntimeInitCommand
  | KernelRuntimeConnectHostCommand
  | KernelRuntimeDisconnectHostCommand
  | KernelRuntimeCreateConversationCommand
  | KernelRuntimeRunTurnCommand
  | KernelRuntimeAbortTurnCommand
  | KernelRuntimeDecidePermissionCommand
  | KernelRuntimeDisposeConversationCommand
  | KernelRuntimeReloadCapabilitiesCommand
  | KernelRuntimePublishHostEventCommand
  | KernelRuntimeSubscribeEventsCommand
  | KernelRuntimePingCommand

export type KernelConversationSnapshot = {
  runtimeId: string
  conversationId: string
  workspacePath: string
  sessionId?: string
  metadata?: Record<string, unknown>
  state:
    | 'created'
    | 'ready'
    | 'running'
    | 'aborting'
    | 'detached'
    | 'disposed'
    | 'failed'
  activeTurnId?: string
  createdAt: string
  updatedAt: string
}

export type KernelTurnSnapshot = {
  conversationId: string
  turnId: string
  state:
    | 'idle'
    | 'starting'
    | 'running'
    | 'aborting'
    | 'completed'
    | 'failed'
    | 'disposed'
  startedAt?: string
  completedAt?: string
  stopReason?: string | null
  error?: unknown
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
      event: KernelEvent
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

export type KernelRuntimeWireAbortSignal = {
  readonly aborted: boolean
  readonly reason?: unknown
  addEventListener(
    type: 'abort',
    listener: () => void,
    options?: { once?: boolean },
  ): void
  removeEventListener(type: 'abort', listener: () => void): void
}

export type KernelRuntimeWireRouter = {
  readonly eventBus: {
    subscribe(handler: KernelRuntimeEventSink): () => void
  }
  handleCommand(
    command: KernelRuntimeCommand,
  ): Promise<KernelRuntimeEnvelopeBase[]>
  handleMessage(message: unknown): Promise<KernelRuntimeEnvelopeBase[]>
  handleCommandLine(line: string): Promise<KernelRuntimeEnvelopeBase[]>
}

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
    command: KernelRuntimeWireClientCommand<KernelRuntimeRunTurnCommand>,
  ): Promise<KernelRuntimeEnvelopeBase>
  abortTurn(
    command: KernelRuntimeWireClientCommand<KernelRuntimeAbortTurnCommand>,
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

export type KernelRuntimeWireConversation = {
  readonly id: string
  readonly activeTurnId: string | undefined
  snapshot(): KernelConversationSnapshot
}

export type KernelRuntimeWireConversationRecoverySnapshot = {
  conversation: KernelConversationSnapshot
  activeTurn?: KernelTurnSnapshot
}

export type KernelRuntimeWireConversationSnapshotStore = {
  readLatest(
    conversationId: string,
  ):
    | KernelRuntimeWireConversationRecoverySnapshot
    | Promise<KernelRuntimeWireConversationRecoverySnapshot | undefined>
    | undefined
  append(
    snapshot: KernelRuntimeWireConversationRecoverySnapshot,
  ): void | Promise<void>
}

export type KernelRuntimeWirePermissionBroker = {
  requestPermission(
    request: KernelPermissionRequest,
  ): Promise<KernelPermissionDecision>
  decide(decision: KernelPermissionDecision): KernelPermissionDecision
  snapshot?(): {
    pendingRequestIds: string[]
    finalizedRequestIds: string[]
  }
}

export type KernelRuntimeWireTurnExecutionContext = {
  command: KernelRuntimeRunTurnCommand
  conversation: KernelRuntimeWireConversation
  eventBus: KernelRuntimeWireRouter['eventBus']
  permissionBroker?: KernelRuntimeWirePermissionBroker
  signal: KernelRuntimeWireAbortSignal
}

export type KernelRuntimeWireTurnExecutor = (
  context: KernelRuntimeWireTurnExecutionContext,
) => KernelRuntimeWireTurnExecutionResult

export type KernelRuntimeHeadlessProcessExecutorOptions = {
  command?: string
  args?: readonly string[]
  cwd?: string
  env?: Record<string, string | undefined>
  killTimeoutMs?: number
}

export type KernelRuntimeWireCapabilityResolver = {
  listDescriptors(): readonly KernelCapabilityDescriptor[]
  requireCapability?(
    name: KernelCapabilityName,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Promise<unknown>
  reloadCapabilities(
    scope: KernelCapabilityReloadScope,
    context?: { cwd?: string; metadata?: Record<string, unknown> },
  ): Promise<readonly KernelCapabilityDescriptor[]>
}

export type KernelRuntimeWireProtocolOptions = {
  runtimeId?: string
  workspacePath?: string
  eventJournalPath?: string | false
  conversationJournalPath?: string | false
  maxReplayEvents?: number
  capabilityResolver?: KernelRuntimeWireCapabilityResolver
  permissionBroker?: KernelRuntimeWirePermissionBroker
  runTurnExecutor?: KernelRuntimeWireTurnExecutor
  headlessExecutor?: false | KernelRuntimeHeadlessProcessExecutorOptions
}

export type KernelRuntimeWireInput = AsyncIterable<string | Uint8Array>

export type KernelRuntimeWireOutput = {
  write(chunk: string): unknown
}

export type KernelRuntimeWireRunnerOptions =
  KernelRuntimeWireProtocolOptions & {
    input?: KernelRuntimeWireInput
    output?: KernelRuntimeWireOutput
  }

export type KernelHeadlessStore = {
  getState(): KernelHeadlessState
  setState(updater: (prev: KernelHeadlessState) => KernelHeadlessState): void
}

export type KernelHeadlessEnvironment = {
  store: KernelHeadlessStore
  commands: KernelCommand[]
  tools: KernelTool[]
  sdkMcpConfigs: Record<string, KernelMcpServerConfig>
  agents: KernelAgentDefinition[]
}

export type DefaultKernelHeadlessEnvironmentOptions = {
  commands: KernelCommand[]
  disableSlashCommands?: boolean
  tools: KernelTool[]
  sdkMcpConfigs: Record<string, KernelMcpServerConfig>
  agents: KernelAgentDefinition[]
  mcpClients?: KernelMcpServerConnection[]
  mcpCommands?: KernelCommand[]
  mcpTools?: KernelTool[]
  toolPermissionContext: KernelToolPermissionContext
  effortArgument?: unknown
  modelForFastMode?: string | null
  advisorModel?: string
  kairosEnabled?: boolean
}

export type KernelHeadlessRunOptions = {
  continue: boolean | undefined
  resume: string | boolean | undefined
  resumeSessionAt: string | undefined
  verbose: boolean | undefined
  outputFormat: string | undefined
  jsonSchema: KernelJsonSchema | undefined
  permissionPromptToolName: string | undefined
  allowedTools: string[] | undefined
  thinkingConfig: KernelThinkingConfig | undefined
  maxTurns: number | undefined
  maxBudgetUsd: number | undefined
  taskBudget: { total: number } | undefined
  systemPrompt: string | undefined
  appendSystemPrompt: string | undefined
  userSpecifiedModel: string | undefined
  fallbackModel: string | undefined
  teleport: string | true | null | undefined
  sdkUrl: string | undefined
  replayUserMessages: boolean | undefined
  includePartialMessages: boolean | undefined
  forkSession: boolean | undefined
  rewindFiles: string | undefined
  enableAuthStatus: boolean | undefined
  agent: string | undefined
  workload: string | undefined
  setupTrigger?: 'init' | 'maintenance' | undefined
  sessionStartHooksPromise?: Promise<unknown[]>
  setSDKStatus?: (status: unknown) => void
  runtimeEventSink?: KernelRuntimeEventSink
}

type KernelHeadlessDeps = {
  runHeadlessRuntime: (...args: unknown[]) => Promise<void>
}

export type KernelHeadlessSession = {
  run(
    inputPrompt: KernelHeadlessInput,
    options: KernelHeadlessRunOptions,
  ): Promise<void>
  getState(): KernelHeadlessState
  setState(updater: (prev: KernelHeadlessState) => KernelHeadlessState): void
}

export type KernelHeadlessMcpConnectOptions = {
  store: KernelHeadlessStore
  regularMcpConfigs: Record<string, KernelMcpServerConfig>
  claudeaiConfigPromise: Promise<Record<string, KernelMcpServerConfig>>
  claudeAiTimeoutMs?: number
}

export type PrepareKernelHeadlessStartupOptions = {
  sessionPersistenceDisabled: boolean
  betas: string[]
  bareMode: boolean
  userType?: string
}

export type PrepareKernelHeadlessStartupDeps = {
  startDeferredPrefetches(): void
  logSessionTelemetry(): void
}

type KernelDirectConnectSessionOptions = {
  serverUrl: string
  authToken?: string
  cwd: string
  dangerouslySkipPermissions?: boolean
  unixSocket?: string
}

type KernelDirectConnectSessionState = {
  serverUrl: string
  workDir?: string
}

type KernelDirectConnectSessionResult = {
  config: DirectConnectConfig
  workDir?: string
  state: KernelDirectConnectSessionState
}

type KernelDirectConnectStateWriter = {
  setOriginalCwd(cwd: string): void
  setCwdState(cwd: string): void
  setDirectConnectServerUrl(url: string): void
}

type KernelServerHostConfigInput = {
  port: string | number | undefined
  host?: string
  authToken?: string
  unix?: string
  workspace?: string
  idleTimeoutMs?: string | number | undefined
  maxSessions?: string | number | undefined
  createAuthToken?: () => string
}

type KernelServerHandle = {
  port: number
  stop(closeActiveConnections: boolean): void | Promise<void>
  [key: string]: unknown
}

type KernelServerHostAssembly = {
  authToken: string
  config: ServerConfig
  sessionManager: unknown
  logger: unknown
  server: KernelServerHandle
}

type KernelSchemaLike<T> = {
  parse(input: unknown): T
  safeParse(
    input: unknown,
  ): { success: true; data: T } | { success: false; error: unknown }
}

type KernelAbortSignalLike = {
  readonly aborted: boolean
}

export type ServerConfig = {
  port: number
  host: string
  authToken: string
  unix?: string
  idleTimeoutMs?: number
  maxSessions?: number
  workspace?: string
}

export type SessionState =
  | 'starting'
  | 'running'
  | 'detached'
  | 'stopping'
  | 'stopped'

export type DirectConnectConfig = {
  serverUrl: string
  sessionId: string
  wsUrl: string
  authToken?: string
  unixSocket?: string
}

export type SessionInfo = {
  id: string
  status: SessionState
  createdAt: number
  workDir: string
  process: unknown | null
  sessionKey?: string
}

export type SessionIndexEntry = {
  sessionId: string
  transcriptSessionId: string
  cwd: string
  permissionMode?: string
  createdAt: number
  lastActiveAt: number
}

export type SessionIndex = Record<string, SessionIndexEntry>

export declare function createDefaultKernelHeadlessEnvironment(
  options: DefaultKernelHeadlessEnvironmentOptions,
): KernelHeadlessEnvironment

export declare function createKernelHeadlessSession(
  environment: KernelHeadlessEnvironment,
  deps?: KernelHeadlessDeps,
): KernelHeadlessSession

export declare function createKernelHeadlessStore(
  initialState: KernelHeadlessState,
): KernelHeadlessStore

export declare function runKernelHeadless(
  inputPrompt: KernelHeadlessInput,
  environment: KernelHeadlessEnvironment,
  options: KernelHeadlessRunOptions,
  deps?: KernelHeadlessDeps,
): Promise<void>

export declare function connectDefaultKernelHeadlessMcp(
  options: KernelHeadlessMcpConnectOptions,
): Promise<{ claudeaiTimedOut: boolean }>

export declare function prepareKernelHeadlessStartup(
  options: PrepareKernelHeadlessStartupOptions,
  deps: PrepareKernelHeadlessStartupDeps,
): Promise<void>

export declare function createKernelSession(
  options: KernelDirectConnectSessionOptions,
): Promise<KernelDirectConnectSessionResult>

export declare function connectDirectHostSession(
  options: KernelDirectConnectSessionOptions,
  writer: KernelDirectConnectStateWriter,
): Promise<DirectConnectConfig>

export declare function applyDirectConnectSessionState(
  state: KernelDirectConnectSessionState,
  writer: KernelDirectConnectStateWriter,
): void

export declare function assembleServerHost(
  input: KernelServerHostConfigInput,
): KernelServerHostAssembly

export declare function getDirectConnectErrorMessage(error: unknown): string

export declare function createDirectConnectSession(
  options: KernelDirectConnectSessionOptions,
): Promise<KernelDirectConnectSessionResult>

export declare class DirectConnectError extends Error {}

export declare function runKernelHeadlessClient(
  config: DirectConnectConfig,
  prompt: string,
  outputFormat?: string,
  interactive?: boolean,
): Promise<void>

export declare function runConnectHeadless(
  config: DirectConnectConfig,
  prompt: string,
  outputFormat?: string,
  interactive?: boolean,
): Promise<void>

export declare function startKernelServer(
  config: ServerConfig,
  sessionManager: unknown,
  logger: unknown,
): KernelServerHandle

export declare function startServer(
  config: ServerConfig,
  sessionManager: unknown,
  logger: unknown,
): KernelServerHandle

export declare const connectResponseSchema: () => KernelSchemaLike<{
  session_id: string
  ws_url: string
  work_dir?: string
}>

export declare function runBridgeHeadless(
  opts: Record<string, unknown>,
  signal: KernelAbortSignalLike,
  runBridgeLoop?: (...args: unknown[]) => Promise<void>,
): Promise<void>

export declare function runDaemonWorker(kind?: string): Promise<void>

export declare function createDefaultKernelRuntimeWireRouter(
  options?: KernelRuntimeWireProtocolOptions,
): KernelRuntimeWireRouter

export declare function createKernelRuntimeInProcessWireTransport(
  options: KernelRuntimeInProcessWireTransportOptions,
): KernelRuntimeWireTransport

export declare function createKernelRuntimeStdioWireTransport(
  options: KernelRuntimeStdioWireTransportOptions,
): KernelRuntimeWireTransport

export declare function createKernelRuntimeWireClient(
  transport: KernelRuntimeWireTransport,
  options?: KernelRuntimeWireClientOptions,
): KernelRuntimeWireClient

export declare function runKernelRuntimeWireProtocol(
  options?: KernelRuntimeWireRunnerOptions,
): Promise<void>
