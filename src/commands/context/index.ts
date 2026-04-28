import { createRuntimeSessionIdentityStateProvider } from '../../runtime/core/state/bootstrapProvider.js'
import type { Command } from '../../commands.js'

const runtimeSessionIdentityState = createRuntimeSessionIdentityStateProvider()

function isNonInteractiveSession(): boolean {
  return !runtimeSessionIdentityState.getSessionIdentity().isInteractive
}

export const context: Command = {
  name: 'context',
  description: 'Visualize current context usage as a colored grid',
  isEnabled: () => !isNonInteractiveSession(),
  type: 'local-jsx',
  load: () => import('./context.js'),
}

export const contextNonInteractive: Command = {
  type: 'local',
  name: 'context',
  supportsNonInteractive: true,
  description: 'Show current context usage',
  get isHidden() {
    return !isNonInteractiveSession()
  },
  isEnabled() {
    return isNonInteractiveSession()
  },
  load: () => import('./context-noninteractive.js'),
}
