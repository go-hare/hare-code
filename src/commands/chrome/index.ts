import { createRuntimeSessionIdentityStateProvider } from '../../runtime/core/state/bootstrapProvider.js'
import type { Command } from '../../commands.js'

const runtimeSessionIdentityState = createRuntimeSessionIdentityStateProvider()

function isNonInteractiveSession(): boolean {
  return !runtimeSessionIdentityState.getSessionIdentity().isInteractive
}

const command: Command = {
  name: 'chrome',
  description: 'Claude in Chrome (Beta) settings',
  availability: [],
  isEnabled: () => !isNonInteractiveSession(),
  type: 'local-jsx',
  load: () => import('./chrome.js'),
}

export default command
