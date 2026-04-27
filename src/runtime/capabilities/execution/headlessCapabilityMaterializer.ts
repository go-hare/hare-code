import type {
  AgentDefinition,
  AgentDefinitionsResult,
} from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import {
  getActiveAgentsFromList,
  getAgentDefinitionsWithOverrides,
} from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import type { Command } from '../../../commands.js'
import { getCommands } from '../../../commands.js'
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

export type RuntimeCommandAssemblyResult = {
  commands: Command[]
  agentDefinitionsResult: AgentDefinitionsResult
}

export type RuntimeToolSetInput = {
  tools?: Tools
  extraTools?: Tool[]
  applyCoordinatorToolFilter?: boolean
  toolPermissionContext: ToolPermissionContext
}

export type HeadlessCapabilityMaterializerDeps = {
  primeCommandSources(entrypoint?: string): void
  getCommands(cwd: string): Promise<Command[]>
  getTools(permissionContext: ToolPermissionContext): Tools
  getAgentDefinitionsWithOverrides(cwd: string): Promise<AgentDefinitionsResult>
  getActiveAgentsFromList(agents: AgentDefinition[]): AgentDefinition[]
  applyCoordinatorToolFilter(tools: Tools): Tools
}

const defaultDeps: HeadlessCapabilityMaterializerDeps = {
  primeCommandSources: primeRuntimeCommandSources,
  getCommands,
  getTools,
  getAgentDefinitionsWithOverrides,
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
