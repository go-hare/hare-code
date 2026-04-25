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

export type KernelHeadlessStore = {
  getState(): KernelHeadlessState
  setState(
    updater: (prev: KernelHeadlessState) => KernelHeadlessState,
  ): void
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
  setState(
    updater: (prev: KernelHeadlessState) => KernelHeadlessState,
  ): void
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
  ):
    | { success: true; data: T }
    | { success: false; error: unknown }
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
