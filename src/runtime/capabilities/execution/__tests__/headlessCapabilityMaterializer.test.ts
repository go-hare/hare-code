import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type {
  AgentDefinition,
  AgentDefinitionsResult,
} from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import type { Command } from '../../../../commands.js'
import type { Tool, ToolPermissionContext, Tools } from '../../../../Tool.js'
import {
  materializeRuntimeCommandAssembly,
  materializeRuntimeToolSet,
  materializeRuntimeHeadlessEnvironment,
  preloadRuntimeCommandAssembly,
  refreshRuntimeAgentDefinitions,
  refreshRuntimeCommands,
  resolvePreloadedRuntimeCommandAssembly,
  type HeadlessCapabilityMaterializerDeps,
} from '../headlessCapabilityMaterializer.js'

const permissionContext = {
  mode: 'default',
} as unknown as ToolPermissionContext

const promptCommand = {
  name: 'prompt-ok',
  type: 'prompt',
  disableNonInteractive: false,
} as Command

function tool(name: string): Tool {
  return { name, isEnabled: () => true } as unknown as Tool
}

const baseTool = tool('Bash')
const filteredTool = tool('FilteredBash')
const extraTool = tool('SyntheticOutput')

const builtInAgent = {
  agentType: 'general-purpose',
  source: 'built-in',
} as AgentDefinition
const overrideAgent = {
  agentType: 'reviewer',
  source: 'flagSettings',
} as AgentDefinition

function createDeps(): HeadlessCapabilityMaterializerDeps {
  const agentDefinitions: AgentDefinitionsResult = {
    activeAgents: [builtInAgent],
    allAgents: [builtInAgent],
  }

  return {
    primeCommandSources: mock((_entrypoint?: string) => {}),
    getCommands: mock(async (_cwd: string) => [promptCommand]),
    clearCommandsCache: mock(() => {}),
    clearCommandMemoizationCaches: mock(() => {}),
    getTools: mock((_context: ToolPermissionContext) => [baseTool]),
    getAgentDefinitionsWithOverrides: mock(
      async (_cwd: string) => agentDefinitions,
    ),
    clearAgentDefinitionsCache: mock(() => {}),
    getActiveAgentsFromList: mock((agents: AgentDefinition[]) => agents),
    applyCoordinatorToolFilter: mock((_tools: Tools) => [filteredTool]),
  }
}

describe('materializeRuntimeHeadlessEnvironment', () => {
  let deps: HeadlessCapabilityMaterializerDeps

  beforeEach(() => {
    deps = createDeps()
  })

  test('materializes commands, tools, and agents from runtime sources', async () => {
    const environment = await materializeRuntimeHeadlessEnvironment(
      {
        cwd: '/repo',
        entrypoint: 'cli',
        toolPermissionContext: permissionContext,
        agentOverrides: [overrideAgent],
        applyCoordinatorToolFilter: true,
        extraTools: [extraTool],
        sdkMcpConfigs: {
          local: { type: 'sdk', name: 'local' },
        },
      },
      deps,
    )

    expect(deps.primeCommandSources).toHaveBeenCalledWith('cli')
    expect(deps.getCommands).toHaveBeenCalledWith('/repo')
    expect(deps.getTools).toHaveBeenCalledWith(permissionContext)
    expect(deps.getAgentDefinitionsWithOverrides).toHaveBeenCalledWith('/repo')
    expect(deps.getActiveAgentsFromList).toHaveBeenCalledWith([
      builtInAgent,
      overrideAgent,
    ])
    expect(deps.applyCoordinatorToolFilter).toHaveBeenCalledWith([baseTool])

    expect(environment).toMatchObject({
      commands: [promptCommand],
      tools: [filteredTool, extraTool],
      sdkMcpConfigs: {
        local: { type: 'sdk', name: 'local' },
      },
      agents: [builtInAgent, overrideAgent],
      toolPermissionContext: permissionContext,
    })
  })

  test('preserves explicit capability injections for compatibility', async () => {
    const explicitCommand = { name: 'explicit-command' } as Command
    const explicitTool = tool('ExplicitTool')
    const explicitAgent = {
      agentType: 'explicit',
      source: 'flagSettings',
    } as AgentDefinition

    const environment = await materializeRuntimeHeadlessEnvironment(
      {
        commands: [explicitCommand],
        tools: [explicitTool] as Tools,
        agents: [explicitAgent],
        toolPermissionContext: permissionContext,
        extraTools: [extraTool],
      },
      deps,
    )

    expect(deps.getCommands).not.toHaveBeenCalled()
    expect(deps.getTools).not.toHaveBeenCalled()
    expect(deps.getAgentDefinitionsWithOverrides).not.toHaveBeenCalled()
    expect(deps.getActiveAgentsFromList).not.toHaveBeenCalled()

    expect(environment.commands).toEqual([explicitCommand])
    expect(environment.tools).toEqual([explicitTool, extraTool])
    expect(environment.agents).toEqual([explicitAgent])
  })
})

describe('materializeRuntimeToolSet', () => {
  test('materializes the same built-in tool path for interactive and headless callers', () => {
    const deps = createDeps()

    const tools = materializeRuntimeToolSet(
      {
        toolPermissionContext: permissionContext,
        applyCoordinatorToolFilter: true,
        extraTools: [extraTool],
      },
      deps,
    )

    expect(deps.getTools).toHaveBeenCalledWith(permissionContext)
    expect(deps.applyCoordinatorToolFilter).toHaveBeenCalledWith([baseTool])
    expect(tools).toEqual([filteredTool, extraTool])
  })

  test('preserves explicit tool injections without re-reading tool catalog', () => {
    const deps = createDeps()
    const explicitTool = tool('ExplicitTool')

    const tools = materializeRuntimeToolSet(
      {
        tools: [explicitTool],
        toolPermissionContext: permissionContext,
        applyCoordinatorToolFilter: true,
        extraTools: [extraTool],
      },
      deps,
    )

    expect(deps.getTools).not.toHaveBeenCalled()
    expect(deps.applyCoordinatorToolFilter).not.toHaveBeenCalled()
    expect(tools).toEqual([explicitTool, extraTool])
  })
})

describe('materializeRuntimeCommandAssembly', () => {
  test('loads commands and agents through the shared runtime materializer', async () => {
    const deps = createDeps()

    const result = await materializeRuntimeCommandAssembly(
      {
        cwd: '/repo',
        entrypoint: 'cli',
      },
      deps,
    )

    expect(deps.primeCommandSources).toHaveBeenCalledWith('cli')
    expect(deps.getCommands).toHaveBeenCalledWith('/repo')
    expect(deps.getAgentDefinitionsWithOverrides).toHaveBeenCalledWith('/repo')
    expect(result.commands).toEqual([promptCommand])
    expect(result.agentDefinitionsResult).toEqual({
      activeAgents: [builtInAgent],
      allAgents: [builtInAgent],
    })
  })

  test('preserves preloaded interactive command assembly inputs', async () => {
    const deps = createDeps()
    const preloadedAgentDefinitions = {
      activeAgents: [overrideAgent],
      allAgents: [overrideAgent],
    }

    const result = await materializeRuntimeCommandAssembly(
      {
        cwd: '/repo',
        commands: [promptCommand],
        agentDefinitionsResult: preloadedAgentDefinitions,
      },
      deps,
    )

    expect(deps.getCommands).not.toHaveBeenCalled()
    expect(deps.getAgentDefinitionsWithOverrides).not.toHaveBeenCalled()
    expect(result).toEqual({
      commands: [promptCommand],
      agentDefinitionsResult: preloadedAgentDefinitions,
    })
  })

  test('preloads interactive command assembly through runtime sources', async () => {
    const deps = createDeps()

    const preloaded = preloadRuntimeCommandAssembly(
      {
        cwd: '/pre',
        enabled: true,
      },
      deps,
    )
    const result = await resolvePreloadedRuntimeCommandAssembly(
      {
        currentCwd: '/repo',
        preloaded,
      },
      deps,
    )

    expect(deps.getCommands).toHaveBeenCalledWith('/pre')
    expect(deps.getAgentDefinitionsWithOverrides).toHaveBeenCalledWith('/pre')
    expect(deps.getCommands).toHaveBeenCalledTimes(1)
    expect(deps.getAgentDefinitionsWithOverrides).toHaveBeenCalledTimes(1)
    expect(result.commands).toEqual([promptCommand])
    expect(result.agentDefinitionsResult).toEqual({
      activeAgents: [builtInAgent],
      allAgents: [builtInAgent],
    })
  })

  test('falls back to current cwd when interactive preload is disabled', async () => {
    const deps = createDeps()

    const preloaded = preloadRuntimeCommandAssembly(
      {
        cwd: '/pre',
        enabled: false,
      },
      deps,
    )
    const result = await resolvePreloadedRuntimeCommandAssembly(
      {
        currentCwd: '/repo',
        preloaded,
      },
      deps,
    )

    expect(deps.getCommands).toHaveBeenCalledWith('/repo')
    expect(deps.getAgentDefinitionsWithOverrides).toHaveBeenCalledWith('/repo')
    expect(result.commands).toEqual([promptCommand])
  })
})

describe('runtime capability refresh helpers', () => {
  test('refreshes commands through the runtime full-cache path', async () => {
    const deps = createDeps()

    const commands = await refreshRuntimeCommands(
      {
        cwd: '/repo',
        mode: 'full',
      },
      deps,
    )

    expect(deps.clearCommandsCache).toHaveBeenCalled()
    expect(deps.clearCommandMemoizationCaches).not.toHaveBeenCalled()
    expect(deps.getCommands).toHaveBeenCalledWith('/repo')
    expect(commands).toEqual([promptCommand])
  })

  test('refreshes commands through the runtime memoized path', async () => {
    const deps = createDeps()

    const commands = await refreshRuntimeCommands(
      {
        cwd: '/repo',
        mode: 'memoized',
      },
      deps,
    )

    expect(deps.clearCommandsCache).not.toHaveBeenCalled()
    expect(deps.clearCommandMemoizationCaches).toHaveBeenCalled()
    expect(deps.getCommands).toHaveBeenCalledWith('/repo')
    expect(commands).toEqual([promptCommand])
  })

  test('refreshes resumed agent definitions through runtime ownership', async () => {
    const deps = createDeps()

    const definitions = await refreshRuntimeAgentDefinitions(
      {
        cwd: '/repo',
        activeFromAll: true,
      },
      deps,
    )

    expect(deps.clearAgentDefinitionsCache).toHaveBeenCalled()
    expect(deps.getAgentDefinitionsWithOverrides).toHaveBeenCalledWith('/repo')
    expect(deps.getActiveAgentsFromList).toHaveBeenCalledWith([builtInAgent])
    expect(definitions).toEqual({
      activeAgents: [builtInAgent],
      allAgents: [builtInAgent],
    })
  })
})
