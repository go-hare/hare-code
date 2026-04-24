/**
 * Stable bridge-facing kernel exports.
 *
 * This keeps external hosts off internal runtime paths while reusing the
 * existing bridge capability implementation.
 */
import { basename } from 'path'
import {
  BridgeFatalError,
  createBridgeApiClient,
  validateBridgeId,
} from '../bridge/bridgeApi.js'
import { getTrustedDeviceToken } from '../bridge/trustedDevice.js'
import { toInfraSessionId } from '../bridge/sessionIdCompat.js'
import { createSessionSpawner } from '../bridge/sessionRunner.js'
import { createBridgeLogger } from '../bridge/bridgeUI.js'
import {
  BRIDGE_LOGIN_ERROR,
  type BridgeApiClient,
  type BridgeConfig,
  type BridgeLogger,
  type SessionSpawner,
  type SpawnMode,
} from '../bridge/types.js'
import { getBridgeBaseUrl } from '../bridge/bridgeConfig.js'
import { hasWorktreeCreateHook } from '../utils/hooks.js'
import { findGitRoot, getBranch, getRemoteUrl } from '../utils/git.js'
import { initSinks } from '../utils/sinks.js'
import { checkHasTrustDialogAccepted, enableConfigs } from '../utils/config.js'
import { setCwdState, setOriginalCwd } from '../bootstrap/state.js'
import { getBootstrapArgs, getScriptPath } from '../utils/cliLaunch.js'
import { BridgeHeadlessPermanentError, type HeadlessBridgeOpts } from '../runtime/capabilities/bridge/HeadlessBridgeRuntime.js'
import type {
  BridgeLoopRunner,
  HeadlessBridgeApiFactoryParams,
  HeadlessBridgeDeps,
  HeadlessBridgeInitialSessionParams,
} from '../runtime/capabilities/bridge/contracts.js'
import {
  archiveBridgeSessionRuntime,
  createBridgeSessionRuntime,
  getBridgeSessionRuntime,
  updateBridgeSessionTitleRuntime,
} from '../runtime/capabilities/bridge/SessionApi.js'
import {
  createBridgePersistenceOwner,
  runBridgeCliRuntime,
  runBridgeHeadlessRuntime,
  type BridgeCliEntry,
  type BridgeHeadlessEntry,
} from '../runtime/capabilities/bridge/BridgeRuntime.js'
import { runHeadlessBridgeRuntime } from '../runtime/capabilities/bridge/HeadlessBridgeEntry.js'

function spawnScriptArgs(): string[] {
  const bootstrap = [...getBootstrapArgs()]
  const script = getScriptPath()
  if (script) {
    bootstrap.push(script)
  }
  return bootstrap
}

export type BridgeCliHostAssembly = {
  spawner: SessionSpawner
  logger: BridgeLogger
  toggleAvailable: boolean
}

export type AssembleBridgeCliHostParams = {
  dir: string
  branch: string
  gitRepoUrl: string | null
  spawnMode: SpawnMode
  worktreeAvailable: boolean
  verbose: boolean
  sandbox: boolean
  debugFile?: string
  permissionMode?: string
  onDebug: (message: string) => void
}

export async function assembleBridgeCliHost(
  params: AssembleBridgeCliHostParams,
): Promise<BridgeCliHostAssembly> {
  const spawner = createSessionSpawner({
    execPath: process.execPath,
    scriptArgs: spawnScriptArgs(),
    env: process.env,
    verbose: params.verbose,
    sandbox: params.sandbox,
    debugFile: params.debugFile,
    permissionMode: params.permissionMode,
    onDebug: params.onDebug,
    onActivity: (sessionId, activity) => {
      params.onDebug(
        `[bridge:activity] sessionId=${sessionId} ${activity.type} ${activity.summary}`,
      )
    },
    onPermissionRequest: (sessionId, request) => {
      params.onDebug(
        `[bridge:perm] sessionId=${sessionId} tool=${request.request.tool_name} request_id=${request.request_id} (not auto-approving)`,
      )
    },
  })

  const logger = createBridgeLogger({ verbose: params.verbose })
  const { parseGitHubRepository } = await import('../utils/detectRepository.js')
  const ownerRepo = params.gitRepoUrl
    ? parseGitHubRepository(params.gitRepoUrl)
    : null
  const repoName = ownerRepo ? ownerRepo.split('/').pop()! : basename(params.dir)
  logger.setRepoInfo(repoName, params.branch)

  const toggleAvailable =
    params.spawnMode !== 'single-session' && params.worktreeAvailable
  if (toggleAvailable) {
    logger.setSpawnModeDisplay(params.spawnMode as 'same-dir' | 'worktree')
  }

  return {
    spawner,
    logger,
    toggleAvailable,
  }
}

export type CreateBridgeCliInitialSessionParams = {
  resumeSessionId?: string
  preCreateSession: boolean
  environmentId: string
  title?: string
  gitRepoUrl: string | null
  branch: string
  signal: AbortSignal
  baseUrl: string
  getAccessToken: () => string | undefined
  permissionMode?: string
  onDebug: (message: string) => void
}

export async function createBridgeCliInitialSession(
  params: CreateBridgeCliInitialSessionParams,
): Promise<string | null> {
  let initialSessionId = params.resumeSessionId ?? null
  if (params.preCreateSession && !params.resumeSessionId) {
    try {
      initialSessionId = await createBridgeSessionRuntime({
        environmentId: params.environmentId,
        title: params.title,
        events: [],
        gitRepoUrl: params.gitRepoUrl,
        branch: params.branch,
        signal: params.signal,
        baseUrl: params.baseUrl,
        getAccessToken: params.getAccessToken,
        permissionMode: params.permissionMode,
      })
      if (initialSessionId) {
        params.onDebug(`[bridge:init] Created initial session ${initialSessionId}`)
      }
    } catch (err) {
      const { errorMessage } = await import('../utils/errors.js')
      params.onDebug(
        `[bridge:init] Session creation failed (non-fatal): ${errorMessage(err)}`,
      )
    }
  }

  return initialSessionId
}

export type StartBridgeCliPointerRefreshParams = {
  dir: string
  sessionId: string | null
  environmentId: string
  spawnMode: SpawnMode
  source?: 'standalone' | 'repl'
}

export type BridgeCliPointerRefresh = {
  stop(): void
}

export class BridgeCliResumeError extends Error {
  constructor(
    readonly code:
      | 'invalid_session_id'
      | 'session_not_found'
      | 'missing_environment_id',
    message: string,
  ) {
    super(message)
    this.name = 'BridgeCliResumeError'
  }
}

export class BridgeCliRegistrationError extends Error {
  constructor(readonly status: number | undefined, message: string) {
    super(message)
    this.name = 'BridgeCliRegistrationError'
  }
}

export type RegisterBridgeCliEnvironmentParams = {
  api: Pick<BridgeApiClient, 'registerBridgeEnvironment'>
  config: BridgeConfig
}

export async function registerBridgeCliEnvironment(
  params: RegisterBridgeCliEnvironmentParams,
): Promise<{ environmentId: string; environmentSecret: string }> {
  try {
    const reg = await params.api.registerBridgeEnvironment(params.config)
    return {
      environmentId: reg.environment_id,
      environmentSecret: reg.environment_secret,
    }
  } catch (err) {
    const { errorMessage } = await import('../utils/errors.js')
    throw new BridgeCliRegistrationError(
      err instanceof BridgeFatalError ? err.status : undefined,
      err instanceof BridgeFatalError && err.status === 404
        ? 'Remote Control environments are not available for your account.'
        : `Error: ${errorMessage(err)}`,
    )
  }
}

export type ResolveBridgeCliResumeRegistrationParams = {
  resumeSessionId?: string
  resumePointerDir?: string
  baseUrl: string
  getAccessToken: () => string | undefined
  refreshAccessTokenIfNeeded?: () => Promise<unknown>
  clearAccessTokenCache?: () => void
  onDebug: (message: string) => void
}

export async function resolveBridgeCliResumeRegistration(
  params: ResolveBridgeCliResumeRegistrationParams,
): Promise<string | undefined> {
  if (!params.resumeSessionId) {
    return undefined
  }

  try {
    validateBridgeId(params.resumeSessionId, 'sessionId')
  } catch {
    throw new BridgeCliResumeError(
      'invalid_session_id',
      `Error: Invalid session ID "${params.resumeSessionId}". Session IDs must not contain unsafe characters.`,
    )
  }

  await params.refreshAccessTokenIfNeeded?.()
  params.clearAccessTokenCache?.()

  const session = await getBridgeSessionRuntime(params.resumeSessionId, {
    baseUrl: params.baseUrl,
    getAccessToken: params.getAccessToken,
  })

  if (!session) {
    if (params.resumePointerDir) {
      const { clearBridgePointer } = await import('../bridge/bridgePointer.js')
      await clearBridgePointer(params.resumePointerDir)
    }
    throw new BridgeCliResumeError(
      'session_not_found',
      `Error: Session ${params.resumeSessionId} not found. It may have been archived or expired, or your login may have lapsed (run \`claude /login\`).`,
    )
  }

  if (!session.environment_id) {
    if (params.resumePointerDir) {
      const { clearBridgePointer } = await import('../bridge/bridgePointer.js')
      await clearBridgePointer(params.resumePointerDir)
    }
    throw new BridgeCliResumeError(
      'missing_environment_id',
      `Error: Session ${params.resumeSessionId} has no environment_id. It may never have been attached to a bridge.`,
    )
  }

  params.onDebug(
    `[bridge:init] Resuming session ${params.resumeSessionId} on environment ${session.environment_id}`,
  )
  return session.environment_id
}

export class BridgeCliResumeReconnectError extends Error {
  constructor(readonly fatal: boolean, message: string) {
    super(message)
    this.name = 'BridgeCliResumeReconnectError'
  }
}

export type ResolveBridgeCliResumeReconnectParams = {
  api: Pick<BridgeApiClient, 'reconnectSession'>
  environmentId: string
  reuseEnvironmentId?: string
  resumeSessionId?: string
  resumePointerDir?: string
  onDebug: (message: string) => void
  onEnvMismatch?: (
    requestedEnvironmentId: string,
    actualEnvironmentId: string,
  ) => void
}

export type BridgeCliResumeReconnectResult = {
  effectiveResumeSessionId?: string
  warningMessage?: string
}

export async function resolveBridgeCliResumeReconnect(
  params: ResolveBridgeCliResumeReconnectParams,
): Promise<BridgeCliResumeReconnectResult> {
  if (!params.resumeSessionId) {
    return {}
  }

  if (
    params.reuseEnvironmentId &&
    params.environmentId !== params.reuseEnvironmentId
  ) {
    params.onEnvMismatch?.(params.reuseEnvironmentId, params.environmentId)
    return {
      warningMessage: `Warning: Could not resume session ${params.resumeSessionId} — its environment has expired. Creating a fresh session instead.`,
    }
  }

  const infraResumeId = toInfraSessionId(params.resumeSessionId)
  const reconnectCandidates =
    infraResumeId === params.resumeSessionId
      ? [params.resumeSessionId]
      : [params.resumeSessionId, infraResumeId]

  let lastReconnectErr: unknown
  for (const candidateId of reconnectCandidates) {
    try {
      await params.api.reconnectSession(params.environmentId, candidateId)
      params.onDebug(
        `[bridge:init] Session ${candidateId} re-queued via bridge/reconnect`,
      )
      return { effectiveResumeSessionId: params.resumeSessionId }
    } catch (err) {
      lastReconnectErr = err
      const { errorMessage } = await import('../utils/errors.js')
      params.onDebug(
        `[bridge:init] reconnectSession(${candidateId}) failed: ${errorMessage(err)}`,
      )
    }
  }

  const err = lastReconnectErr
  const isFatal = err instanceof BridgeFatalError
  if (params.resumePointerDir && isFatal) {
    const { clearBridgePointer } = await import('../bridge/bridgePointer.js')
    await clearBridgePointer(params.resumePointerDir)
  }
  const { errorMessage } = await import('../utils/errors.js')
  throw new BridgeCliResumeReconnectError(
    isFatal,
    isFatal
      ? `Error: ${errorMessage(err)}`
      : `Error: Failed to reconnect session ${params.resumeSessionId}: ${errorMessage(err)}\nThe session may still be resumable — try running the same command again.`,
  )
}

export type BridgeCliHostControls = {
  controller: AbortController
  onStdinData(data: Buffer): void
  onSigint(): void
  onSigterm(): void
  attach(): void
  stop(): void
}

export type CreateBridgeCliHostControlsParams = {
  logger: Pick<
    BridgeLogger,
    'toggleQr' | 'logStatus' | 'setSpawnModeDisplay' | 'refreshDisplay'
  >
  toggleAvailable: boolean
  config: { spawnMode: SpawnMode }
  onDebug: (message: string) => void
  onSpawnModeToggled?: (mode: 'same-dir' | 'worktree') => void
  persistSpawnMode?: (mode: 'same-dir' | 'worktree') => void
}

export function createBridgeCliHostControls(
  params: CreateBridgeCliHostControlsParams,
): BridgeCliHostControls {
  const controller = new AbortController()

  const onSigint = (): void => {
    params.onDebug('[bridge:shutdown] SIGINT received, shutting down')
    controller.abort()
  }

  const onSigterm = (): void => {
    params.onDebug('[bridge:shutdown] SIGTERM received, shutting down')
    controller.abort()
  }

  const onStdinData = (data: Buffer): void => {
    if (data[0] === 0x03 || data[0] === 0x04) {
      onSigint()
      return
    }
    if (data[0] === 0x20) {
      params.logger.toggleQr()
      return
    }
    if (data[0] !== 0x77 || !params.toggleAvailable) {
      return
    }

    const newMode: 'same-dir' | 'worktree' =
      params.config.spawnMode === 'same-dir' ? 'worktree' : 'same-dir'
    params.config.spawnMode = newMode
    params.onSpawnModeToggled?.(newMode)
    params.logger.logStatus(
      newMode === 'worktree'
        ? 'Spawn mode: worktree (new sessions get isolated git worktrees)'
        : 'Spawn mode: same-dir (new sessions share the current directory)',
    )
    params.logger.setSpawnModeDisplay(newMode)
    params.logger.refreshDisplay()
    params.persistSpawnMode?.(newMode)
  }

  const attach = (): void => {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true)
      process.stdin.resume()
      process.stdin.on('data', onStdinData)
    }
    process.on('SIGINT', onSigint)
    process.on('SIGTERM', onSigterm)
  }

  const stop = (): void => {
    process.off('SIGINT', onSigint)
    process.off('SIGTERM', onSigterm)
    process.stdin.off('data', onStdinData)
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false)
    }
    process.stdin.pause()
  }

  return {
    controller,
    onStdinData,
    onSigint,
    onSigterm,
    attach,
    stop,
  }
}

export async function startBridgeCliPointerRefresh(
  params: StartBridgeCliPointerRefreshParams,
): Promise<BridgeCliPointerRefresh | null> {
  if (!params.sessionId || params.spawnMode !== 'single-session') {
    return null
  }

  const { writeBridgePointer } = await import('../bridge/bridgePointer.js')
  const pointerPayload = {
    sessionId: params.sessionId,
    environmentId: params.environmentId,
    source: params.source ?? ('standalone' as const),
  }
  await writeBridgePointer(params.dir, pointerPayload)
  const timer = setInterval(
    writeBridgePointer,
    60 * 60 * 1000,
    params.dir,
    pointerPayload,
  )
  timer.unref?.()

  return {
    stop() {
      clearInterval(timer)
    },
  }
}

export function createBridgeHeadlessDeps(
  runBridgeLoop: BridgeLoopRunner,
): HeadlessBridgeDeps {
  return {
    bridgeLoginError: BRIDGE_LOGIN_ERROR,
    async getBaseUrl() {
      return getBridgeBaseUrl()
    },
    async setWorkingDirectory(dir: string) {
      process.chdir(dir)
      setOriginalCwd(dir)
      setCwdState(dir)
    },
    async ensureTrustedWorkspace() {
      enableConfigs()
      return checkHasTrustDialogAccepted()
    },
    async initRuntimeSinks() {
      initSinks()
    },
    async getGitMetadata(dir: string, spawnMode: HeadlessBridgeOpts['spawnMode']) {
      return {
        branch: await getBranch(),
        gitRepoUrl: await getRemoteUrl(),
        worktreeAvailable:
          spawnMode !== 'worktree'
            ? true
            : hasWorktreeCreateHook() || findGitRoot(dir) !== null,
      }
    },
    createApi({
      baseUrl,
      getAccessToken,
      onAuth401,
      log,
    }: HeadlessBridgeApiFactoryParams) {
      return createBridgeApiClient({
        baseUrl,
        getAccessToken,
        runnerVersion: MACRO.VERSION,
        onDebug: log,
        onAuth401,
        getTrustedDeviceToken,
      })
    },
    async createSpawner(runtimeOpts: HeadlessBridgeOpts) {
      return createSessionSpawner({
        execPath: process.execPath,
        scriptArgs: spawnScriptArgs(),
        env: process.env,
        verbose: false,
        sandbox: runtimeOpts.sandbox,
        permissionMode: runtimeOpts.permissionMode,
        onDebug: runtimeOpts.log,
      })
    },
    runBridgeLoop,
    async createInitialSession(params: HeadlessBridgeInitialSessionParams) {
      return createBridgeSessionRuntime({
        environmentId: params.environmentId,
        title: params.title,
        events: [],
        gitRepoUrl: params.gitRepoUrl,
        branch: params.branch,
        signal: params.signal,
        baseUrl: params.baseUrl,
        getAccessToken: params.getAccessToken,
        permissionMode: params.permissionMode,
      })
    },
  }
}

export async function runBridgeHeadless(
  opts: HeadlessBridgeOpts,
  signal: AbortSignal,
  runBridgeLoop?: BridgeLoopRunner,
): Promise<void> {
  const effectiveRunBridgeLoop =
    runBridgeLoop ??
    (await import('../bridge/bridgeMain.js')).runBridgeLoop
  return runHeadlessBridgeRuntime(
    opts,
    signal,
    createBridgeHeadlessDeps(effectiveRunBridgeLoop),
  )
}

export {
  runBridgeCliRuntime,
  runBridgeHeadlessRuntime,
  createBridgePersistenceOwner,
  type BridgeCliEntry,
  type BridgeHeadlessEntry,
  type BridgeLoopRunner,
  type HeadlessBridgeOpts,
  archiveBridgeSessionRuntime,
  createBridgeSessionRuntime,
  getBridgeSessionRuntime,
  updateBridgeSessionTitleRuntime,
}
