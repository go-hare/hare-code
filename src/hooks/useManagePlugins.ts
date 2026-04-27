import { useCallback, useEffect } from 'react'
import { useNotifications } from '../context/notifications.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../services/analytics/index.js'
import { useAppState, useSetAppState } from '../state/AppState.js'
import { logForDiagnosticsNoPII } from '../utils/diagLogs.js'
import { createRuntimePluginService } from '../runtime/capabilities/plugins/RuntimePluginService.js'

/**
 * Hook to manage plugin state and synchronize with AppState.
 *
 * On mount: loads all plugins, runs delisting enforcement, surfaces flagged-
 * plugin notifications, populates AppState.plugins. This is the initial
 * Layer-3 load — subsequent refresh goes through /reload-plugins.
 *
 * On needsRefresh: shows a notification directing the user to /reload-plugins.
 * Does NOT auto-refresh. All Layer-3 swap (commands, agents, hooks, MCP)
 * goes through refreshActivePlugins() via /reload-plugins for one consistent
 * mental model. See Outline: declarative-settings-hXHBMDIf4b PR 5c.
 */
export function useManagePlugins({
  enabled = true,
}: {
  enabled?: boolean
} = {}) {
  const setAppState = useSetAppState()
  const needsRefresh = useAppState(s => s.plugins.needsRefresh)
  const { addNotification } = useNotifications()

  // Initial plugin load. Runs once on mount. NOT used for refresh — all
  // post-mount refresh goes through /reload-plugins → refreshActivePlugins().
  // Unlike refreshActivePlugins, this also runs delisting enforcement and
  // flagged-plugin notifications (session-start concerns), and does NOT bump
  // mcp.pluginReconnectKey (MCP effects fire on their own mount).
  const initialPluginLoad = useCallback(async () => {
    const service = createRuntimePluginService({ setAppState })
    const { metrics, flaggedPlugins } = await service.loadInitialPluginState()

    if (Object.keys(flaggedPlugins).length > 0) {
      addNotification({
        key: 'plugin-delisted-flagged',
        text: 'Plugins flagged. Check /plugins',
        color: 'warning',
        priority: 'high',
      })
    }

    return metrics
  }, [setAppState, addNotification])

  // Load plugins on mount and emit telemetry
  useEffect(() => {
    if (!enabled) return
    void initialPluginLoad().then(metrics => {
      const { ant_enabled_names, ...baseMetrics } = metrics
      const allMetrics = {
        ...baseMetrics,
        has_custom_plugin_cache_dir: !!process.env.CLAUDE_CODE_PLUGIN_CACHE_DIR,
      }
      logEvent('tengu_plugins_loaded', {
        ...allMetrics,
        ...(ant_enabled_names !== undefined && {
          enabled_names:
            ant_enabled_names as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        }),
      })
      logForDiagnosticsNoPII('info', 'tengu_plugins_loaded', allMetrics)
    })
  }, [initialPluginLoad, enabled])

  // Plugin state changed on disk (background reconcile, /plugin menu,
  // external settings edit). Show a notification; user runs /reload-plugins
  // to apply. The previous auto-refresh here had a stale-cache bug (only
  // cleared loadAllPlugins, downstream memoized loaders returned old data)
  // and was incomplete (no MCP, no agentDefinitions). /reload-plugins
  // handles all of that correctly via refreshActivePlugins().
  useEffect(() => {
    if (!enabled || !needsRefresh) return
    addNotification({
      key: 'plugin-reload-pending',
      text: 'Plugins changed. Run /reload-plugins to activate.',
      color: 'suggestion',
      priority: 'low',
    })
    // Do NOT auto-refresh. Do NOT reset needsRefresh — /reload-plugins
    // consumes it via refreshActivePlugins().
  }, [enabled, needsRefresh, addNotification])
}
