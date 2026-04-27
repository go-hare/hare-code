import { describe, expect, mock, test } from 'bun:test'
import type { AgentDefinition } from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import type { Command } from '../../../../commands.js'
import type { AppState } from '../../../../state/AppState.js'
import type {
  LoadedPlugin,
  PluginError,
  PluginLoadResult,
} from '../../../../types/plugin.js'
import type { RuntimeHookService } from '../../hooks/RuntimeHookService.js'
import {
  createRuntimePluginService,
  type RuntimePluginServiceDeps,
} from '../RuntimePluginService.js'

const command = {
  name: 'plugin-command',
  type: 'prompt',
} as Command

const agent = {
  agentType: 'plugin-agent',
  source: 'plugin',
} as AgentDefinition

const enabledPlugin = {
  name: 'plugin-one',
  source: 'plugin-one@inline',
  hooksConfig: {
    Stop: [
      {
        matcher: '*',
        hooks: [{ type: 'command', command: 'echo stop' }],
      },
    ],
  },
} as unknown as LoadedPlugin

const disabledPlugin = {
  name: 'plugin-two',
  source: 'plugin-two@marketplace',
} as unknown as LoadedPlugin

function createHookService(): RuntimeHookService {
  return {
    refreshPluginHooks: mock(async ({ enabledPlugins }) => ({
      hook_count: enabledPlugins?.length ?? 0,
      hook_load_failed: false,
    })),
    countPluginHooks: mock(() => 1),
    clearPluginHookCache: mock(() => {}),
    pruneRemovedPluginHooks: mock(async () => {}),
    setupHotReload: mock(() => {}),
  }
}

function createDeps(
  overrides: Partial<RuntimePluginServiceDeps> = {},
): RuntimePluginServiceDeps {
  const loadResult: PluginLoadResult = {
    enabled: [enabledPlugin],
    disabled: [disabledPlugin],
    errors: [],
  }

  return {
    loadAllPlugins: mock(async () => loadResult),
    detectAndUninstallDelistedPlugins: mock(async () => {}),
    getFlaggedPlugins: mock(() => ({})),
    getPluginCommands: mock(async () => [command]),
    loadPluginAgents: mock(async () => [agent]),
    hookService: createHookService(),
    loadPluginMcpServers: mock(async (_plugin, _errors) => ({
      one: { type: 'stdio', command: 'node' },
      two: { type: 'http', url: 'http://localhost' },
    })),
    loadPluginLspServers: mock(async (_plugin, _errors) => ({
      ts: { command: 'typescript-language-server', args: ['--stdio'] },
    })),
    reinitializeLspServerManager: mock(() => {}),
    logError: mock(() => {}),
    logForDebugging: mock(() => {}),
    ...overrides,
  } as unknown as RuntimePluginServiceDeps
}

function createState(): AppState {
  return {
    plugins: {
      enabled: [],
      disabled: [],
      commands: [],
      errors: [
        {
          type: 'generic-error',
          source: 'lsp-manager',
          error: 'keep me',
        },
      ] as PluginError[],
    },
  } as unknown as AppState
}

describe('RuntimePluginService', () => {
  test('materializes initial interactive plugin state through runtime services', async () => {
    let state = createState()
    const setAppState = mock((updater: (prev: AppState) => AppState) => {
      state = updater(state)
    })
    const deps = createDeps()
    const service = createRuntimePluginService({ setAppState }, deps)

    const result = await service.loadInitialPluginState()

    expect(deps.loadAllPlugins).toHaveBeenCalled()
    expect(deps.hookService.refreshPluginHooks).toHaveBeenCalledWith({
      enabledPlugins: [enabledPlugin],
      errors: [],
    })
    expect(deps.reinitializeLspServerManager).toHaveBeenCalled()
    expect(state.plugins.enabled).toEqual([enabledPlugin])
    expect(state.plugins.disabled).toEqual([disabledPlugin])
    expect(state.plugins.commands).toEqual([command])
    expect(state.plugins.errors).toEqual([
      {
        type: 'generic-error',
        source: 'lsp-manager',
        error: 'keep me',
      },
    ])
    expect(result.metrics).toMatchObject({
      enabled_count: 1,
      disabled_count: 1,
      inline_count: 1,
      marketplace_count: 0,
      skill_count: 1,
      agent_count: 1,
      hook_count: 1,
      mcp_count: 2,
      lsp_count: 1,
    })
  })

  test('records plugin-system errors without losing preserved LSP errors', async () => {
    let state = createState()
    const setAppState = mock((updater: (prev: AppState) => AppState) => {
      state = updater(state)
    })
    const deps = createDeps({
      loadAllPlugins: mock(async () => {
        throw new Error('load failed')
      }),
    })
    const service = createRuntimePluginService({ setAppState }, deps)

    const result = await service.loadInitialPluginState()

    expect(deps.logError).toHaveBeenCalled()
    expect(result.metrics.load_failed).toBe(true)
    expect(state.plugins.enabled).toEqual([])
    expect(state.plugins.commands).toEqual([])
    expect(state.plugins.errors).toEqual([
      {
        type: 'generic-error',
        source: 'lsp-manager',
        error: 'keep me',
      },
      {
        type: 'generic-error',
        source: 'plugin-system',
        error: 'load failed',
      },
    ])
  })
})
