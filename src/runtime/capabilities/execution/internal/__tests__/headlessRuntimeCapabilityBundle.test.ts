import { describe, expect, mock, test } from 'bun:test'

import type { AgentDefinition } from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import type { Command } from '../../../../../commands.js'
import type { RuntimeHeadlessMcpService } from '../../../mcp/RuntimeHeadlessMcpService.js'
import {
  createHeadlessRuntimeCapabilityBundle,
  type HeadlessRuntimeCapabilityBundleDeps,
} from '../headlessRuntimeCapabilityBundle.js'

const initialCommand = {
  name: 'initial',
  type: 'prompt',
  description: 'initial command',
  source: 'builtin',
} as Command

const refreshedCommand = {
  name: 'refreshed',
  type: 'prompt',
  description: 'refreshed command',
  source: 'builtin',
  argumentHint: '<arg>',
} as Command

const hiddenCommand = {
  name: 'hidden',
  type: 'prompt',
  description: 'hidden command',
  source: 'builtin',
  userInvocable: false,
} as Command

const pluginAgent = {
  agentType: 'plugin-agent',
  whenToUse: 'plugin work',
  model: 'inherit',
  source: 'plugin',
} as AgentDefinition

const sdkAgent = {
  agentType: 'sdk-agent',
  whenToUse: 'sdk work',
  model: 'haiku',
  source: 'flagSettings',
} as AgentDefinition

function createMcpService(): RuntimeHeadlessMcpService {
  return {
    getSdkMcpConfigs: mock(() => ({ sdk: { type: 'sdk', name: 'sdk' } })),
    getSdkClients: mock(() => []),
    getSdkTools: mock(() => []),
    getDynamicState: mock(() => ({ clients: [], tools: [], configs: {} })),
    getAllClients: mock(baseClients => [...(baseClients ?? [])]),
    findConfig: mock(() => null),
    updateSdk: mock(async () => {}),
    applyServerChanges: mock(async () => ({
      response: { added: [], removed: [], errors: {} },
      sdkServersChanged: false,
    })),
    replaceDynamicConnection: mock(() => {}),
    removeDynamicConnection: mock(() => {}),
    buildStatuses: mock(() => [
      {
        name: 'sdk',
        status: 'connected',
      },
    ]),
  } as unknown as RuntimeHeadlessMcpService
}

function createDeps(): HeadlessRuntimeCapabilityBundleDeps {
  return {
    getCommands: mock(async () => [refreshedCommand, hiddenCommand]),
    refreshActivePlugins: mock(async () => ({
      enabled_count: 1,
      disabled_count: 0,
      command_count: 1,
      agent_count: 1,
      hook_count: 1,
      mcp_count: 1,
      lsp_count: 0,
      error_count: 0,
      agentDefinitions: {
        activeAgents: [pluginAgent],
        allAgents: [pluginAgent],
      },
      pluginCommands: [],
    })),
    loadAllPluginsCacheOnly: mock(async () =>
      (({
        enabled: [
          {
            name: 'plugin-one',
            path: '/plugins/plugin-one',
            source: 'plugin-one@local',
          },
        ],
        disabled: [],
        errors: [],
      }) as unknown) as Awaited<
        ReturnType<HeadlessRuntimeCapabilityBundleDeps['loadAllPluginsCacheOnly']>
      >,
    ),
    applyPluginMcpDiffRuntime: mock(async () => {}),
    logError: mock(() => {}),
  }
}

describe('createHeadlessRuntimeCapabilityBundle', () => {
  test('refreshes commands, plugins, agents, hooks, and MCP statuses as one runtime bundle', async () => {
    const deps = createDeps()
    const mcpService = createMcpService()
    const bundle = createHeadlessRuntimeCapabilityBundle(
      {
        initialCommands: [initialCommand],
        initialAgents: [sdkAgent],
        getCwd: () => '/repo',
        setAppState: mock(() => {}),
        mcpService,
      },
      deps,
    )

    const response = await bundle.refreshPlugins()

    expect(deps.refreshActivePlugins).toHaveBeenCalled()
    expect(deps.getCommands).toHaveBeenCalledWith('/repo')
    expect(deps.applyPluginMcpDiffRuntime).toHaveBeenCalledWith({
      sdkMcpConfigs: { sdk: { type: 'sdk', name: 'sdk' } },
      applyMcpServerChanges: mcpService.applyServerChanges,
      updateSdkMcp: mcpService.updateSdk,
    })
    expect(response.commands).toEqual([
      {
        name: 'refreshed',
        description: 'refreshed command',
        argumentHint: '<arg>',
      },
    ])
    expect(response.agents).toEqual([
      {
        name: 'plugin-agent',
        description: 'plugin work',
        model: undefined,
      },
      {
        name: 'sdk-agent',
        description: 'sdk work',
        model: 'haiku',
      },
    ])
    expect(response.plugins).toEqual([
      {
        name: 'plugin-one',
        path: '/plugins/plugin-one',
        source: 'plugin-one@local',
      },
    ])
    expect(response.mcpServers).toEqual([{ name: 'sdk', status: 'connected' }])
    expect(bundle.getCommands()).toEqual([refreshedCommand, hiddenCommand])
    expect(bundle.getAgents()).toEqual([pluginAgent, sdkAgent])
  })
})
