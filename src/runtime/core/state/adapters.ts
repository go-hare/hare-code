import type { AppState } from 'src/state/AppStateStore.js'
import type {
  RuntimeAppStateProvider,
  RuntimeBootstrapStateProvider,
  RuntimeStateProviders,
} from './providers.js'
import { createBootstrapStateProvider } from './bootstrapProvider.js'

type RuntimeAppStateAdapterOptions = {
  getAppState: () => AppState
  setAppState: (updater: (prev: AppState) => AppState) => void
  bootstrapStateProvider?: RuntimeBootstrapStateProvider
}

export function createAppStateProvider(
  options: RuntimeAppStateAdapterOptions,
): RuntimeAppStateProvider {
  return {
    getExecutionState() {
      const state = options.getAppState()
      return {
        toolPermissionContext: state.toolPermissionContext,
        fileHistory: state.fileHistory,
        attribution: state.attribution,
        fastMode: state.fastMode,
      }
    },
    getAppState() {
      return options.getAppState()
    },
    updateToolPermissionContext(updater) {
      options.setAppState(prev => {
        const next = updater(prev.toolPermissionContext)
        if (next === prev.toolPermissionContext) {
          return prev
        }
        return {
          ...prev,
          toolPermissionContext: next,
        }
      })
    },
    updateFileHistory(updater) {
      options.setAppState(prev => {
        const next = updater(prev.fileHistory)
        if (next === prev.fileHistory) {
          return prev
        }
        return {
          ...prev,
          fileHistory: next,
        }
      })
    },
    updateAttribution(updater) {
      options.setAppState(prev => {
        const next = updater(prev.attribution)
        if (next === prev.attribution) {
          return prev
        }
        return {
          ...prev,
          attribution: next,
        }
      })
    },
    setFastMode(value) {
      options.setAppState(prev => {
        if (prev.fastMode === value) {
          return prev
        }
        return {
          ...prev,
          fastMode: value,
        }
      })
    },
  }
}

export function createExecutionStateProviders(
  options: RuntimeAppStateAdapterOptions,
): RuntimeStateProviders {
  return {
    bootstrap:
      options.bootstrapStateProvider ?? createBootstrapStateProvider(),
    app: createAppStateProvider(options),
  }
}
