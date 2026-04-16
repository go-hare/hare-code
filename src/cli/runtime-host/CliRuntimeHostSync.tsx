import React, { useEffect, useRef } from 'react'
import { useNotifications } from '../../context/notifications.js'
import { useAppStateStore } from '../../state/AppState.js'
import type { CliRuntimeHostAdapter } from './CliRuntimeHostAdapter.js'
import { createRuntimeTaskSignature, mapLegacyTaskToRuntimeTask } from './legacyTaskMirror.js'

type Props = {
  adapter?: CliRuntimeHostAdapter
}

export function CliRuntimeHostSync({ adapter }: Props): React.ReactNode {
  const { addNotification } = useNotifications()
  const store = useAppStateStore()
  const seenNotificationKeysRef = useRef(new Set<string>())
  const mirroredTaskSignaturesRef = useRef(new Map<string, string>())

  useEffect(() => {
    if (!adapter) {
      return
    }

    let disposed = false

    const syncNotifications = () => {
      const state = adapter.getState()
      for (const notification of state.notifications) {
        if (seenNotificationKeysRef.current.has(notification.key)) {
          continue
        }
        seenNotificationKeysRef.current.add(notification.key)
        addNotification({
          key: notification.key,
          text: notification.text,
          priority: notification.priority,
          ...(notification.level === 'warning' || notification.level === 'error'
            ? { color: 'warning' as const }
            : {}),
        })
      }
    }

    const syncLegacyTasks = () => {
      const tasks = store.getState().tasks
      const nextIds = new Set<string>()

      for (const task of Object.values(tasks)) {
        const runtimeTask = mapLegacyTaskToRuntimeTask(task)
        const signature = createRuntimeTaskSignature(runtimeTask)
        nextIds.add(runtimeTask.taskId)

        if (
          mirroredTaskSignaturesRef.current.get(runtimeTask.taskId) === signature
        ) {
          continue
        }

        mirroredTaskSignaturesRef.current.set(runtimeTask.taskId, signature)
        adapter.upsertTask(runtimeTask)
      }

      for (const taskId of [...mirroredTaskSignaturesRef.current.keys()]) {
        if (nextIds.has(taskId)) {
          continue
        }
        mirroredTaskSignaturesRef.current.delete(taskId)
        adapter.removeTask(taskId)
      }
    }

    adapter.connect()
    const unsubscribe = adapter.subscribe(() => {
      syncNotifications()
    })
    const unsubscribeStore = store.subscribe(() => {
      syncLegacyTasks()
    })
    syncLegacyTasks()
    syncNotifications()

    void adapter.start().catch(error => {
      if (disposed) {
        return
      }
      addNotification({
        key: 'runtime-host-start-failed',
        text:
          error instanceof Error
            ? `runtime host start failed: ${error.message}`
            : 'runtime host start failed',
        priority: 'high',
        color: 'warning',
      })
    })

    return () => {
      disposed = true
      unsubscribe()
      unsubscribeStore()
      adapter.disconnect()
      void adapter.stop()
    }
  }, [adapter, addNotification, store])

  return null
}
