import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import { randomUUID } from 'crypto'
import { dirname, resolve } from 'path'
import { ask } from '../QueryEngine.js'
import {
  getOriginalCwd,
  getSessionId,
  getSessionProjectDir,
  setOriginalCwd,
  switchSession,
} from '../bootstrap/state.js'
import { getCommands } from '../commands.js'
import { buildDefaultCodingTools } from '../runtime/tools-default/index.js'
import { getDefaultAppState, type AppState } from '../state/AppStateStore.js'
import { getEmptyToolPermissionContext } from '../Tool.js'
import { asSessionId } from '../types/ids.js'
import type { Message } from '../types/message.js'
import {
  loadConversationForResume,
  type TurnInterruptionState,
} from '../utils/conversationRecovery.js'
import { createAbortController } from '../utils/abortController.js'
import { enableConfigs } from '../utils/config.js'
import {
  createFileStateCacheWithSizeLimit,
  READ_FILE_STATE_CACHE_SIZE,
  type FileStateCache,
} from '../utils/fileStateCache.js'
import { hasPermissionsToUseTool } from '../utils/permissions/permissions.js'
import { extractReadFilesFromMessages } from '../utils/queryHelpers.js'
import { resetSessionFilePointer } from '../utils/sessionStorage.js'
import { restoreSessionStateFromLog } from '../utils/sessionRestore.js'
import type { SDKMessage } from './types.js'

export type HeadlessSessionProvider = {
  baseUrl?: string
  apiKey?: string
  model?: string
}

export type CreateHeadlessChatSessionOptions = {
  cwd: string
  sessionId?: string
  provider: HeadlessSessionProvider
  maxTurns?: number
  maxBudgetUsd?: number
  replayUserMessages?: boolean
  includePartialMessages?: boolean
  customSystemPrompt?: string
  appendSystemPrompt?: string
}

export type HeadlessChatSession = {
  getSessionId(): string
  stream(prompt: string | ContentBlockParam[]): AsyncGenerator<SDKMessage, void, unknown>
  abort(): void
  close(): Promise<void>
}

type ProviderEnvKey =
  | 'ANTHROPIC_BASE_URL'
  | 'ANTHROPIC_API_KEY'
  | 'ANTHROPIC_AUTH_TOKEN'

const PROVIDER_ENV_KEYS: ProviderEnvKey[] = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
]

type ActiveHeadlessSession = {
  sessionId: string
  cwd: string
}

let activeHeadlessSession: ActiveHeadlessSession | null = null

function acquireHeadlessSessionLease(
  sessionId: string,
  cwd: string,
): () => void {
  if (activeHeadlessSession) {
    throw new Error(
      `hare-code/sdk 的 headless session 当前为进程级单并发。活跃会话: ${activeHeadlessSession.sessionId} (${activeHeadlessSession.cwd})。如需并发，请使用独立进程或 RuntimeBridgeServer。`,
    )
  }

  activeHeadlessSession = { sessionId, cwd }
  return () => {
    if (activeHeadlessSession?.sessionId === sessionId) {
      activeHeadlessSession = null
    }
  }
}

function applyProviderEnvironment(provider: HeadlessSessionProvider): () => void {
  const previous = new Map<ProviderEnvKey, string | undefined>()
  for (const key of PROVIDER_ENV_KEYS) {
    previous.set(key, process.env[key])
  }

  const nextValues: Record<ProviderEnvKey, string | undefined> = {
    ANTHROPIC_BASE_URL: provider.baseUrl || undefined,
    ANTHROPIC_API_KEY: provider.apiKey || undefined,
    ANTHROPIC_AUTH_TOKEN: provider.apiKey || undefined,
  }

  for (const key of PROVIDER_ENV_KEYS) {
    const value = nextValues[key]
    if (value) {
      process.env[key] = value
    } else {
      delete process.env[key]
    }
  }

  return () => {
    for (const key of PROVIDER_ENV_KEYS) {
      const value = previous.get(key)
      if (value) {
        process.env[key] = value
      } else {
        delete process.env[key]
      }
    }
  }
}

class HeadlessChatSessionImpl implements HeadlessChatSession {
  private readonly cwd: string
  private readonly provider: HeadlessSessionProvider
  private readonly maxTurns?: number
  private readonly maxBudgetUsd?: number
  private readonly replayUserMessages: boolean
  private readonly includePartialMessages: boolean
  private readonly customSystemPrompt?: string
  private readonly appendSystemPrompt?: string
  private commandsPromise: ReturnType<typeof getCommands> | null = null

  private sessionId: string
  private sessionProjectDir: string | null = null
  private initialized = false
  private running = false
  private appState: AppState
  private mutableMessages: Message[] = []
  private readFileCache: FileStateCache
  private turnInterruptionState: TurnInterruptionState = { kind: 'none' }
  private abortController: AbortController | null = null

  constructor(options: CreateHeadlessChatSessionOptions) {
    enableConfigs()
    this.cwd = resolve(options.cwd)
    this.provider = options.provider
    this.maxTurns = options.maxTurns
    this.maxBudgetUsd = options.maxBudgetUsd
    this.replayUserMessages = options.replayUserMessages ?? false
    this.includePartialMessages = options.includePartialMessages ?? true
    this.customSystemPrompt = options.customSystemPrompt
    this.appendSystemPrompt = options.appendSystemPrompt
    this.sessionId = options.sessionId || randomUUID()
    this.appState = {
      ...getDefaultAppState(),
      toolPermissionContext: getEmptyToolPermissionContext(),
    }
    this.readFileCache = createFileStateCacheWithSizeLimit(
      READ_FILE_STATE_CACHE_SIZE,
    )
  }

  getSessionId(): string {
    return this.sessionId
  }

  abort(): void {
    this.abortController?.abort()
  }

  async close(): Promise<void> {
    this.abort()
  }

  private getCommandsPromise(): ReturnType<typeof getCommands> {
    if (!this.commandsPromise) {
      this.commandsPromise = getCommands(this.cwd)
    }
    return this.commandsPromise
  }

  private getAppState = (): AppState => this.appState

  private setAppState = (updater: (prev: AppState) => AppState): void => {
    this.appState = updater(this.appState)
  }

  private async ensureInitialized(): Promise<void> {
    setOriginalCwd(this.cwd)
    switchSession(asSessionId(this.sessionId), this.sessionProjectDir)

    if (this.initialized) {
      return
    }

    const resumed = await loadConversationForResume(this.sessionId, undefined)
    if (resumed?.messages?.length) {
      this.sessionId = resumed.sessionId || this.sessionId
      this.sessionProjectDir = resumed.fullPath
        ? dirname(resumed.fullPath)
        : null
      switchSession(asSessionId(this.sessionId), this.sessionProjectDir)
      await resetSessionFilePointer()
      restoreSessionStateFromLog(resumed, this.setAppState)
      this.mutableMessages = resumed.messages
      this.turnInterruptionState = resumed.turnInterruptionState
      this.readFileCache = extractReadFilesFromMessages(
        resumed.messages,
        this.cwd,
        READ_FILE_STATE_CACHE_SIZE,
      )
    }

    this.initialized = true
  }

  async *stream(
    prompt: string | ContentBlockParam[],
  ): AsyncGenerator<SDKMessage, void, unknown> {
    if (this.running) {
      throw new Error('当前会话已有进行中的请求，请等待完成或先中断。')
    }

    const releaseLock = acquireHeadlessSessionLease(this.sessionId, this.cwd)
    const restoreProviderEnv = applyProviderEnvironment(this.provider)
    const previousOriginalCwd = getOriginalCwd()
    const previousSessionId = getSessionId()
    const previousSessionProjectDir = getSessionProjectDir()

    this.running = true
    this.abortController = createAbortController()

    try {
      await this.ensureInitialized()

      const commands = await this.getCommandsPromise()
      const currentAppState = this.getAppState()
      const tools = buildDefaultCodingTools({
        permissionContext: currentAppState.toolPermissionContext,
        mcpTools: currentAppState.mcp.tools,
      })

      yield* ask({
        commands,
        prompt,
        cwd: this.cwd,
        tools,
        verbose: true,
        mcpClients: currentAppState.mcp.clients,
        maxTurns: this.maxTurns,
        maxBudgetUsd: this.maxBudgetUsd,
        canUseTool: hasPermissionsToUseTool,
        mutableMessages: this.mutableMessages,
        customSystemPrompt: this.customSystemPrompt,
        appendSystemPrompt: this.appendSystemPrompt,
        userSpecifiedModel: this.provider.model,
        getAppState: this.getAppState,
        setAppState: this.setAppState,
        getReadFileCache: () => this.readFileCache,
        setReadFileCache: cache => {
          this.readFileCache = cache
        },
        abortController: this.abortController,
        replayUserMessages: this.replayUserMessages,
        includePartialMessages: this.includePartialMessages,
      })

    } finally {
      this.sessionId = getSessionId()
      this.sessionProjectDir = getSessionProjectDir()
      this.abortController = null
      this.running = false
      switchSession(previousSessionId, previousSessionProjectDir)
      setOriginalCwd(previousOriginalCwd)
      restoreProviderEnv()
      releaseLock()
    }
  }
}

export function createHeadlessChatSession(
  options: CreateHeadlessChatSessionOptions,
): HeadlessChatSession {
  return new HeadlessChatSessionImpl(options)
}
