import type { AgentDefinition } from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import type { Command } from '../../../commands.js'
import { count } from '../../../utils/array.js'
import { logForDebugging } from '../../../utils/debug.js'
import { toError } from '../../../utils/errors.js'
import { logError as defaultLogError } from '../../../utils/log.js'
import { loadPluginAgents } from '../../../utils/plugins/loadPluginAgents.js'
import { getPluginCommands } from '../../../utils/plugins/loadPluginCommands.js'
import { loadPluginLspServers } from '../../../utils/plugins/lspPluginIntegration.js'
import { loadPluginMcpServers } from '../../../utils/plugins/mcpPluginIntegration.js'
import { detectAndUninstallDelistedPlugins } from '../../../utils/plugins/pluginBlocklist.js'
import {
  type FlaggedPlugin,
  getFlaggedPlugins,
} from '../../../utils/plugins/pluginFlagging.js'
import { loadAllPlugins } from '../../../utils/plugins/pluginLoader.js'
import { reinitializeLspServerManager } from '../../../services/lsp/manager.js'
import type { AppState } from '../../../state/AppState.js'
import type {
  LoadedPlugin,
  PluginError,
  PluginLoadResult,
} from '../../../types/plugin.js'
import {
  createRuntimeHookService,
  type RuntimeHookService,
} from '../hooks/RuntimeHookService.js'

type SetAppState = (updater: (prev: AppState) => AppState) => void

export type RuntimePluginInitialLoadMetrics = {
  enabled_count: number
  disabled_count: number
  inline_count: number
  marketplace_count: number
  error_count: number
  skill_count: number
  agent_count: number
  hook_count: number
  mcp_count: number
  lsp_count: number
  load_failed?: true
  ant_enabled_names?: string
}

export type RuntimePluginInitialLoadResult = {
  metrics: RuntimePluginInitialLoadMetrics
  flaggedPlugins: Record<string, FlaggedPlugin>
}

export type RuntimePluginService = {
  loadInitialPluginState(): Promise<RuntimePluginInitialLoadResult>
}

export type RuntimePluginServiceDeps = {
  loadAllPlugins(): Promise<PluginLoadResult>
  detectAndUninstallDelistedPlugins(): Promise<unknown>
  getFlaggedPlugins(): Record<string, FlaggedPlugin>
  getPluginCommands(): Promise<Command[]>
  loadPluginAgents(): Promise<AgentDefinition[]>
  hookService: RuntimeHookService
  loadPluginMcpServers(
    plugin: LoadedPlugin,
    errors: PluginError[],
  ): ReturnType<typeof loadPluginMcpServers>
  loadPluginLspServers(
    plugin: LoadedPlugin,
    errors: PluginError[],
  ): ReturnType<typeof loadPluginLspServers>
  reinitializeLspServerManager(): void
  logError(error: unknown): void
  logForDebugging(message: string): void
}

const defaultDeps: RuntimePluginServiceDeps = {
  loadAllPlugins,
  detectAndUninstallDelistedPlugins,
  getFlaggedPlugins,
  getPluginCommands,
  loadPluginAgents,
  hookService: createRuntimeHookService(),
  loadPluginMcpServers,
  loadPluginLspServers,
  reinitializeLspServerManager,
  logError: defaultLogError,
  logForDebugging,
}

export function createRuntimePluginService(
  options: { setAppState: SetAppState },
  deps: RuntimePluginServiceDeps = defaultDeps,
): RuntimePluginService {
  return {
    async loadInitialPluginState() {
      try {
        const { enabled, disabled, errors } = await deps.loadAllPlugins()

        await deps.detectAndUninstallDelistedPlugins()
        const flaggedPlugins = deps.getFlaggedPlugins()

        const commands = await loadCommands(errors, deps)
        const agents = await loadAgents(errors, deps)
        const hookResult = await deps.hookService.refreshPluginHooks({
          enabledPlugins: enabled,
          errors,
        })
        const { mcp_count, lsp_count } = await loadPluginRuntimeServers(
          enabled,
          errors,
          deps,
        )

        options.setAppState(prevState => ({
          ...prevState,
          plugins: {
            ...prevState.plugins,
            enabled,
            disabled,
            commands,
            errors: mergePluginErrors(prevState.plugins.errors, errors),
          },
        }))

        deps.logForDebugging(
          `Loaded plugins - Enabled: ${enabled.length}, Disabled: ${disabled.length}, Commands: ${commands.length}, Agents: ${agents.length}, Errors: ${errors.length}`,
        )

        return {
          metrics: buildMetrics({
            enabled,
            disabled,
            errors,
            commands,
            agents,
            hook_count: hookResult.hook_count,
            mcp_count,
            lsp_count,
          }),
          flaggedPlugins,
        }
      } catch (error) {
        const errorObj = toError(error)
        deps.logError(errorObj)
        deps.logForDebugging(`Error loading plugins: ${error}`)

        options.setAppState(prevState => {
          const existingLspErrors = prevState.plugins.errors.filter(
            e => e.source === 'lsp-manager' || e.source.startsWith('plugin:'),
          )
          return {
            ...prevState,
            plugins: {
              ...prevState.plugins,
              enabled: [],
              disabled: [],
              commands: [],
              errors: [
                ...existingLspErrors,
                {
                  type: 'generic-error',
                  source: 'plugin-system',
                  error: errorObj.message,
                },
              ],
            },
          }
        })

        return {
          metrics: {
            enabled_count: 0,
            disabled_count: 0,
            inline_count: 0,
            marketplace_count: 0,
            error_count: 1,
            skill_count: 0,
            agent_count: 0,
            hook_count: 0,
            mcp_count: 0,
            lsp_count: 0,
            load_failed: true,
          },
          flaggedPlugins: {},
        }
      }
    },
  }
}

async function loadCommands(
  errors: PluginError[],
  deps: RuntimePluginServiceDeps,
): Promise<Command[]> {
  try {
    return await deps.getPluginCommands()
  } catch (error) {
    errors.push({
      type: 'generic-error',
      source: 'plugin-commands',
      error: `Failed to load plugin commands: ${errorMessage(error)}`,
    })
    return []
  }
}

async function loadAgents(
  errors: PluginError[],
  deps: RuntimePluginServiceDeps,
): Promise<AgentDefinition[]> {
  try {
    return await deps.loadPluginAgents()
  } catch (error) {
    errors.push({
      type: 'generic-error',
      source: 'plugin-agents',
      error: `Failed to load plugin agents: ${errorMessage(error)}`,
    })
    return []
  }
}

async function loadPluginRuntimeServers(
  enabled: LoadedPlugin[],
  errors: PluginError[],
  deps: RuntimePluginServiceDeps,
): Promise<{ mcp_count: number; lsp_count: number }> {
  const [mcpServerCounts, lspServerCounts] = await Promise.all([
    Promise.all(
      enabled.map(async plugin => {
        if (plugin.mcpServers) return Object.keys(plugin.mcpServers).length
        const servers = await deps.loadPluginMcpServers(plugin, errors)
        if (servers) plugin.mcpServers = servers
        return servers ? Object.keys(servers).length : 0
      }),
    ),
    Promise.all(
      enabled.map(async plugin => {
        if (plugin.lspServers) return Object.keys(plugin.lspServers).length
        const servers = await deps.loadPluginLspServers(plugin, errors)
        if (servers) plugin.lspServers = servers
        return servers ? Object.keys(servers).length : 0
      }),
    ),
  ])

  deps.reinitializeLspServerManager()

  return {
    mcp_count: mcpServerCounts.reduce((sum, n) => sum + n, 0),
    lsp_count: lspServerCounts.reduce((sum, n) => sum + n, 0),
  }
}

function buildMetrics({
  enabled,
  disabled,
  errors,
  commands,
  agents,
  hook_count,
  mcp_count,
  lsp_count,
}: {
  enabled: LoadedPlugin[]
  disabled: LoadedPlugin[]
  errors: PluginError[]
  commands: Command[]
  agents: AgentDefinition[]
  hook_count: number
  mcp_count: number
  lsp_count: number
}): RuntimePluginInitialLoadMetrics {
  return {
    enabled_count: enabled.length,
    disabled_count: disabled.length,
    inline_count: count(enabled, plugin => plugin.source.endsWith('@inline')),
    marketplace_count: count(
      enabled,
      plugin => !plugin.source.endsWith('@inline'),
    ),
    error_count: errors.length,
    skill_count: commands.length,
    agent_count: agents.length,
    hook_count,
    mcp_count,
    lsp_count,
    ant_enabled_names:
      process.env.USER_TYPE === 'ant' && enabled.length > 0
        ? enabled
            .map(plugin => plugin.name)
            .sort()
            .join(',')
        : undefined,
  }
}

export function mergePluginErrors(
  existing: PluginError[],
  fresh: PluginError[],
): PluginError[] {
  const preserved = existing.filter(
    error =>
      error.source === 'lsp-manager' || error.source.startsWith('plugin:'),
  )
  const freshKeys = new Set(fresh.map(pluginErrorKey))
  const deduped = preserved.filter(error => !freshKeys.has(pluginErrorKey(error)))
  return [...deduped, ...fresh]
}

function pluginErrorKey(error: PluginError): string {
  return error.type === 'generic-error'
    ? `generic-error:${error.source}:${error.error}`
    : `${error.type}:${error.source}`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
