import { createRuntimeHeadlessControlStateProvider } from '../../runtime/core/state/bootstrapProvider.js'
import type { Command } from '../../commands.js'

const runtimeHeadlessControlState = createRuntimeHeadlessControlStateProvider()

function isRemoteMode(): boolean {
  return runtimeHeadlessControlState.getHeadlessControlState().isRemoteMode
}

const session = {
  type: 'local-jsx',
  name: 'session',
  aliases: ['remote'],
  description: 'Show remote session URL and QR code',
  isEnabled: () => isRemoteMode(),
  get isHidden() {
    return !isRemoteMode()
  },
  load: () => import('./session.js'),
} satisfies Command

export default session
