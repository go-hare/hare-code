import type { LoadedPlugin, PluginError } from '../../../types/plugin.js'
import { errorMessage } from '../../../utils/errors.js'
import { logError as defaultLogError } from '../../../utils/log.js'
import {
  clearPluginHookCache,
  loadPluginHooks,
  pruneRemovedPluginHooks,
  setupPluginHookHotReload,
} from '../../../utils/plugins/loadPluginHooks.js'

export type RuntimeHookRefreshResult = {
  hook_count: number
  hook_load_failed: boolean
}

export type RuntimeHookService = {
  refreshPluginHooks(options?: {
    enabledPlugins?: readonly LoadedPlugin[]
    errors?: PluginError[]
  }): Promise<RuntimeHookRefreshResult>
  countPluginHooks(plugins: readonly LoadedPlugin[]): number
  clearPluginHookCache(): void
  pruneRemovedPluginHooks(): Promise<void>
  setupHotReload(): void
}

export type RuntimeHookServiceDeps = {
  loadPluginHooks(): Promise<void>
  clearPluginHookCache(): void
  pruneRemovedPluginHooks(): Promise<void>
  setupPluginHookHotReload(): void
  logError(error: unknown): void
}

const defaultDeps: RuntimeHookServiceDeps = {
  loadPluginHooks,
  clearPluginHookCache,
  pruneRemovedPluginHooks,
  setupPluginHookHotReload,
  logError: defaultLogError,
}

export function countRuntimePluginHooks(
  plugins: readonly LoadedPlugin[],
): number {
  return plugins.reduce((sum, plugin) => {
    if (!plugin.hooksConfig) return sum
    return (
      sum +
      (
        Object.values(plugin.hooksConfig) as Array<
          Array<{ hooks: unknown[] }> | undefined
        >
      ).reduce(
        (eventSum, matchers) =>
          eventSum +
          (matchers?.reduce(
            (matcherSum: number, matcher: { hooks: unknown[] }) =>
              matcherSum + matcher.hooks.length,
            0,
          ) ?? 0),
        0,
      )
    )
  }, 0)
}

export function createRuntimeHookService(
  deps: RuntimeHookServiceDeps = defaultDeps,
): RuntimeHookService {
  return {
    async refreshPluginHooks(options = {}) {
      let hook_load_failed = false
      try {
        await deps.loadPluginHooks()
      } catch (error) {
        hook_load_failed = true
        deps.logError(error)
        options.errors?.push({
          type: 'generic-error',
          source: 'plugin-hooks',
          error: `Failed to load plugin hooks: ${errorMessage(error)}`,
        })
      }

      return {
        hook_count: countRuntimePluginHooks(options.enabledPlugins ?? []),
        hook_load_failed,
      }
    },
    countPluginHooks: countRuntimePluginHooks,
    clearPluginHookCache: deps.clearPluginHookCache,
    pruneRemovedPluginHooks: deps.pruneRemovedPluginHooks,
    setupHotReload: deps.setupPluginHookHotReload,
  }
}
