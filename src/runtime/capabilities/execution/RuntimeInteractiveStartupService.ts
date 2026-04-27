import uniqBy from 'lodash-es/uniqBy.js'
import type { Command } from '../../../commands.js'
import { prefetchAllMcpResources } from '../../../services/mcp/client.js'
import type {
  MCPServerConnection,
  ScopedMcpServerConfig,
} from '../../../services/mcp/types.js'
import { dedupeToolsByName, type Tool } from '../../../Tool.js'
import type { Message as MessageType } from '../../../types/message.js'
import { processSessionStartHooks } from '../../../utils/sessionStart.js'

export type RuntimeInteractiveStartupMcpState = {
  clients: MCPServerConnection[]
  tools: Tool[]
  commands: Command[]
}

export type RuntimeInteractiveStartupWork = {
  mcpPromise: Promise<RuntimeInteractiveStartupMcpState>
  hooksPromise: Promise<MessageType[]> | null
  pendingStartupMessages: Promise<MessageType[]>
}

export type RuntimeInteractiveStartupServiceOptions = {
  isNonInteractiveSession: boolean
  regularMcpConfigs: Record<string, ScopedMcpServerConfig>
  claudeaiConfigPromise: Promise<Record<string, ScopedMcpServerConfig>>
  runStartupHooks: boolean
  startupHookContext?: {
    agentType?: string
    model?: string
  }
  onMcpStartupError(error: unknown): MessageType
}

export type RuntimeInteractiveStartupServiceDeps = {
  prefetchAllMcpResources(
    configs: Record<string, ScopedMcpServerConfig>,
  ): Promise<RuntimeInteractiveStartupMcpState>
  processSessionStartHooks(
    trigger: 'startup',
    options?: {
      agentType?: string
      model?: string
    },
  ): Promise<MessageType[]>
}

const EMPTY_STARTUP_MCP_STATE: RuntimeInteractiveStartupMcpState = {
  clients: [],
  tools: [],
  commands: [],
}

const defaultDeps: RuntimeInteractiveStartupServiceDeps = {
  prefetchAllMcpResources,
  processSessionStartHooks,
}

export function createRuntimeInteractiveStartupService(
  options: RuntimeInteractiveStartupServiceOptions,
  deps: RuntimeInteractiveStartupServiceDeps = defaultDeps,
): { start(): RuntimeInteractiveStartupWork } {
  return {
    start() {
      const mcpPromise = createRuntimeInteractiveStartupMcpPromise(
        options,
        deps,
      )
      const hooksPromise = options.runStartupHooks
        ? deps.processSessionStartHooks('startup', options.startupHookContext)
        : null

      return {
        mcpPromise,
        hooksPromise,
        pendingStartupMessages: createRuntimeInteractiveStartupMcpMessages({
          mcpPromise,
          onError: options.onMcpStartupError,
        }),
      }
    },
  }
}

function createRuntimeInteractiveStartupMcpPromise(
  options: RuntimeInteractiveStartupServiceOptions,
  deps: RuntimeInteractiveStartupServiceDeps,
): Promise<RuntimeInteractiveStartupMcpState> {
  if (options.isNonInteractiveSession) {
    return Promise.resolve(EMPTY_STARTUP_MCP_STATE)
  }

  const localMcpPromise = deps.prefetchAllMcpResources(
    options.regularMcpConfigs,
  )
  const claudeaiMcpPromise = options.claudeaiConfigPromise.then(configs =>
    Object.keys(configs).length > 0
      ? deps.prefetchAllMcpResources(configs)
      : EMPTY_STARTUP_MCP_STATE,
  )

  return Promise.all([localMcpPromise, claudeaiMcpPromise]).then(
    ([local, claudeai]) =>
      mergeRuntimeInteractiveStartupMcpState(local, claudeai),
  )
}

export function mergeRuntimeInteractiveStartupMcpState(
  local: RuntimeInteractiveStartupMcpState,
  claudeai: RuntimeInteractiveStartupMcpState,
): RuntimeInteractiveStartupMcpState {
  return {
    clients: [...local.clients, ...claudeai.clients],
    tools: dedupeToolsByName([...local.tools, ...claudeai.tools]),
    commands: uniqBy([...local.commands, ...claudeai.commands], 'name'),
  }
}

export function createRuntimeInteractiveStartupMcpMessages<T>(options: {
  mcpPromise: Promise<RuntimeInteractiveStartupMcpState>
  onError: (error: unknown) => T
}): Promise<T[]> {
  return options.mcpPromise.then(() => []).catch(error => [
    options.onError(error),
  ])
}
