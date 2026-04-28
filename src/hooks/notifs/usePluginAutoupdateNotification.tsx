import * as React from 'react'
import { useEffect, useState } from 'react'
import { createRuntimeHeadlessControlStateProvider } from '../../runtime/core/state/bootstrapProvider.js'
import { useNotifications } from '../../context/notifications.js'
import { Text } from '@anthropic/ink'
import { logForDebugging } from '../../utils/debug.js'
import { onPluginsAutoUpdated } from '../../utils/plugins/pluginAutoupdate.js'

const runtimeHeadlessControlState = createRuntimeHeadlessControlStateProvider()

function isRemoteMode(): boolean {
  return runtimeHeadlessControlState.getHeadlessControlState().isRemoteMode
}

/**
 * Hook that displays a notification when plugins have been auto-updated.
 * The notification tells the user to run /reload-plugins to apply the updates.
 */
export function usePluginAutoupdateNotification(): void {
  const { addNotification } = useNotifications()
  const [updatedPlugins, setUpdatedPlugins] = useState<string[]>([])

  // Register for autoupdate notifications
  useEffect(() => {
    if (isRemoteMode()) return
    const unsubscribe = onPluginsAutoUpdated(plugins => {
      logForDebugging(
        `Plugin autoupdate notification: ${plugins.length} plugin(s) updated`,
      )
      setUpdatedPlugins(plugins)
    })

    return unsubscribe
  }, [])

  // Show notification when plugins are updated
  useEffect(() => {
    if (isRemoteMode()) return
    if (updatedPlugins.length === 0) {
      return
    }

    // Extract plugin names from plugin IDs (format: "name@marketplace")
    const pluginNames = updatedPlugins.map(id => {
      const atIndex = id.indexOf('@')
      return atIndex > 0 ? id.substring(0, atIndex) : id
    })

    const displayNames =
      pluginNames.length <= 2
        ? pluginNames.join(' and ')
        : `${pluginNames.length} plugins`

    addNotification({
      key: 'plugin-autoupdate-restart',
      jsx: (
        <>
          <Text color="success">
            {pluginNames.length === 1 ? 'Plugin' : 'Plugins'} updated:{' '}
            {displayNames}
          </Text>
          <Text dimColor> · Run /reload-plugins to apply</Text>
        </>
      ),
      priority: 'low',
      timeoutMs: 10000,
    })

    logForDebugging(
      `Showing plugin autoupdate notification for: ${pluginNames.join(', ')}`,
    )
  }, [updatedPlugins, addNotification])
}
