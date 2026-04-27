import type {
  AgentDefinition,
  AgentDefinitionsResult,
} from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import {
  getActiveAgentsFromList,
  getAgentDefinitionsWithOverrides,
} from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import type { Command } from '../../../commands.js'
import {
  clearCommandMemoizationCaches,
  clearCommandsCache,
  getCommands,
} from '../../../commands.js'
import type {
  MCPServerConnection,
  McpSdkServerConfig,
} from '../../../services/mcp/types.js'
import type { AppState } from '../../../state/AppStateStore.js'
import type { Tool, ToolPermissionContext, Tools } from '../../../Tool.js'
import { applyCoordinatorToolFilter } from '../../../utils/toolPool.js'
import { primeRuntimeCommandSources } from '../commands/RuntimeCommandSources.js'
import { getTools } from '../tools/ToolPolicy.js'

export type RuntimeHeadlessEnvironmentInput = {
  cwd?: string
  entrypoint?: string
  commands?: Command[]
  disableSlashCommands?: boolean
  tools?: Tools
  sdkMcpConfigs?: Record<string, McpSdkServerConfig>
  agents?: AgentDefinition[]
  agentOverrides?: AgentDefinition[]
  applyCoordinatorToolFilter?: boolean
  extraTools?: Tool[]
  mcpClients?: MCPServerConnection[]
  mcpCommands?: Command[]
  mcpTools?: Tool[]
  toolPermissionContext: ToolPermissionContext
  effortArgument?: unknown
  modelForFastMode?: AppState['mainLoopModel']
  advisorModel?: string
  kairosEnabled?: boolean
}

export type RuntimeHeadlessMaterializedEnvironment = {
  commands: Command[]
  disableSlashCommands?: boolean
  tools: Tools
  sdkMcpConfigs: Record<string, McpSdkServerConfig>
  agents: AgentDefinition[]
  mcpClients?: MCPServerConnection[]
  mcpCommands?: Command[]
  mcpTools?: Tool[]
  toolPermissionContext: ToolPermissionContext
  effortArgument?: unknown
  modelForFastMode?: AppState['mainLoopModel']
  advisorModel?: string
  kairosEnabled?: boolean
}

export type RuntimeCommandAssemblyInput = {
  cwd?: string
  entrypoint?: string
  commands?: Command[]
  agentDefinitionsResult?: AgentDefinitionsResult
}

export type RuntimeCommandAssemblyPreload = {
  commandsPromise: Promise<Command[]> | null
  agentDefinitionsPromise: Promise<AgentDefinitionsResult> | null
}

export type RuntimeCommandAssemblyResult = {
  commands: Command[]
  agentDefinitionsResult: AgentDefinitionsResult
}

export type RuntimeCommandRefreshMode = 'full' | 'memoized'

export type RuntimeToolSetInput = {
  tools?: Tools
  extraTools?: Tool[]
  applyCoordinatorToolFilter?: boolean
  toolPermissionContext: ToolPermissionContext
}

export type HeadlessCapabilityMaterializerDeps = {
  primeCommandSources(entrypoint?: string): void
  getCommands(cwd: string): Promise<Command[]>
  clearCommandsCache(): void
  clearCommandMemoizationCaches(): void
  getTools(permissionContext: ToolPermissionContext): Tools
  getAgentDefinitionsWithOverrides(cwd: string): Promise<AgentDefinitionsResult>
  clearAgentDefinitionsCache(): void
  getActiveAgentsFromList(agents: AgentDefinition[]): AgentDefinition[]
  applyCoordinatorToolFilter(tools: Tools): Tools
}

const defaultDeps: HeadlessCapabilityMaterializerDeps = {
  primeCommandSources: primeRuntimeCommandSources,
  getCommands,
  clearCommandsCache,
  clearCommandMemoizationCaches,
  getTools,
  getAgentDefinitionsWithOverrides,
  clearAgentDefinitionsCache: () =>
    getAgentDefinitionsWithOverrides.cache.clear?.(),
  getActiveAgentsFromList,
  applyCoordinatorToolFilter,
}

function resolveAgents(
  definitions: AgentDefinitionsResult,
  overrides: readonly AgentDefinition[],
  deps: Pick<HeadlessCapabilityMaterializerDeps, 'getActiveAgentsFromList'>,
): AgentDefinition[] {
  if (overrides.length === 0) {
    return definitions.activeAgents
  }

  return deps.getActiveAgentsFromList([...definitions.allAgents, ...overrides])
}

export async function materializeRuntimeHeadlessEnvironment(
  input: RuntimeHeadlessEnvironmentInput,
  deps: HeadlessCapabilityMaterializerDeps = defaultDeps,
): Promise<RuntimeHeadlessMaterializedEnvironment> {
  const {
    cwd = process.cwd(),
    entrypoint,
    commands,
    disableSlashCommands,
    tools,
    sdkMcpConfigs = {},
    agents,
    agentOverrides = [],
    applyCoordinatorToolFilter: shouldApplyCoordinatorToolFilter = false,
    extraTools = [],
    mcpClients = [],
    mcpCommands = [],
    mcpTools = [],
    toolPermissionContext,
    effortArgument,
    modelForFastMode,
    advisorModel,
    kairosEnabled,
  } = input

  const { commands: materializedCommands, agentDefinitionsResult } =
    await materializeRuntimeCommandAssembly(
      {
        cwd,
        entrypoint,
        commands,
        agentDefinitionsResult: agents
          ? {
              activeAgents: agents,
              allAgents: agents,
            }
          : undefined,
      },
      deps,
    )

  const materializedTools = materializeRuntimeToolSet(
    {
      tools,
      extraTools,
      applyCoordinatorToolFilter: shouldApplyCoordinatorToolFilter,
      toolPermissionContext,
    },
    deps,
  )

  const materializedAgents =
    agents ??
    resolveAgents(agentDefinitionsResult, agentOverrides, {
      getActiveAgentsFromList: deps.getActiveAgentsFromList,
    })

  return {
    commands: materializedCommands,
    disableSlashCommands,
    tools: materializedTools,
    sdkMcpConfigs,
    agents: materializedAgents,
    mcpClients,
    mcpCommands,
    mcpTools,
    toolPermissionContext,
    effortArgument,
    modelForFastMode,
    advisorModel,
    kairosEnabled,
  }
}

export async function materializeRuntimeCommandAssembly(
  input: RuntimeCommandAssemblyInput,
  deps: Pick<
    HeadlessCapabilityMaterializerDeps,
    'primeCommandSources' | 'getCommands' | 'getAgentDefinitionsWithOverrides'
  > = defaultDeps,
): Promise<RuntimeCommandAssemblyResult> {
  const cwd = input.cwd ?? process.cwd()
  deps.primeCommandSources(input.entrypoint)

  const [commands, agentDefinitionsResult] = await Promise.all([
    input.commands ? Promise.resolve(input.commands) : deps.getCommands(cwd),
    input.agentDefinitionsResult
      ? Promise.resolve(input.agentDefinitionsResult)
      : deps.getAgentDefinitionsWithOverrides(cwd),
  ])

  return {
    commands,
    agentDefinitionsResult,
  }
}

export function preloadRuntimeCommandAssembly(
  options: {
    cwd: string
    enabled: boolean
  },
  deps: Pick<
    HeadlessCapabilityMaterializerDeps,
    'getCommands' | 'getAgentDefinitionsWithOverrides'
  > = defaultDeps,
): RuntimeCommandAssemblyPreload {
  const commandsPromise = options.enabled ? deps.getCommands(options.cwd) : null
  const agentDefinitionsPromise = options.enabled
    ? deps.getAgentDefinitionsWithOverrides(options.cwd)
    : null

  commandsPromise?.catch(() => {})
  agentDefinitionsPromise?.catch(() => {})

  return {
    commandsPromise,
    agentDefinitionsPromise,
  }
}

export async function refreshRuntimeCommands(
  options: {
    cwd: string
    mode: RuntimeCommandRefreshMode
  },
  deps: Pick<
    HeadlessCapabilityMaterializerDeps,
    'clearCommandsCache' | 'clearCommandMemoizationCaches' | 'getCommands'
  > = defaultDeps,
): Promise<Command[]> {
  if (options.mode === 'full') {
    deps.clearCommandsCache()
  } else {
    deps.clearCommandMemoizationCaches()
  }

  return deps.getCommands(options.cwd)
}

export async function refreshRuntimeAgentDefinitions(
  options: {
    cwd: string
    activeFromAll?: boolean
  },
  deps: Pick<
    HeadlessCapabilityMaterializerDeps,
    | 'clearAgentDefinitionsCache'
    | 'getAgentDefinitionsWithOverrides'
    | 'getActiveAgentsFromList'
  > = defaultDeps,
): Promise<AgentDefinitionsResult> {
  deps.clearAgentDefinitionsCache()
  const definitions = await deps.getAgentDefinitionsWithOverrides(options.cwd)

  if (!options.activeFromAll) {
    return definitions
  }

  return {
    ...definitions,
    allAgents: definitions.allAgents,
    activeAgents: deps.getActiveAgentsFromList(definitions.allAgents),
  }
}

export async function resolvePreloadedRuntimeCommandAssembly(
  options: {
    currentCwd: string
    preloaded: RuntimeCommandAssemblyPreload
  },
  deps: Pick<
    HeadlessCapabilityMaterializerDeps,
    'primeCommandSources' | 'getCommands' | 'getAgentDefinitionsWithOverrides'
  > = defaultDeps,
): Promise<RuntimeCommandAssemblyResult> {
  const { currentCwd, preloaded } = options
  const [commands, agentDefinitionsResult] = await Promise.all([
    preloaded.commandsPromise ?? deps.getCommands(currentCwd),
    preloaded.agentDefinitionsPromise ??
      deps.getAgentDefinitionsWithOverrides(currentCwd),
  ])

  return materializeRuntimeCommandAssembly(
    {
      cwd: currentCwd,
      commands,
      agentDefinitionsResult,
    },
    deps,
  )
}

export function materializeRuntimeToolSet(
  input: RuntimeToolSetInput,
  deps: Pick<
    HeadlessCapabilityMaterializerDeps,
    'getTools' | 'applyCoordinatorToolFilter'
  > = defaultDeps,
): Tools {
  let materializedTools =
    input.tools ?? deps.getTools(input.toolPermissionContext)
  if (!input.tools && input.applyCoordinatorToolFilter) {
    materializedTools = deps.applyCoordinatorToolFilter(materializedTools)
  }
  if (input.extraTools && input.extraTools.length > 0) {
    materializedTools = [...materializedTools, ...input.extraTools]
  }
  return materializedTools
}
