import { createRuntimeSessionIdentityStateProvider } from '../../runtime/core/state/bootstrapProvider.js'
import type { Command } from '../../commands.js'
import { isOverageProvisioningAllowed } from '../../utils/auth.js'
import { isEnvTruthy } from '../../utils/envUtils.js'

const runtimeSessionIdentityState = createRuntimeSessionIdentityStateProvider()

function isNonInteractiveSession(): boolean {
  return !runtimeSessionIdentityState.getSessionIdentity().isInteractive
}

function isExtraUsageAllowed(): boolean {
  if (isEnvTruthy(process.env.DISABLE_EXTRA_USAGE_COMMAND)) {
    return false
  }
  return isOverageProvisioningAllowed()
}

export const extraUsage = {
  type: 'local-jsx',
  name: 'extra-usage',
  description: 'Configure extra usage to keep working when limits are hit',
  isEnabled: () => isExtraUsageAllowed() && !isNonInteractiveSession(),
  load: () => import('./extra-usage.js'),
} satisfies Command

export const extraUsageNonInteractive = {
  type: 'local',
  name: 'extra-usage',
  supportsNonInteractive: true,
  description: 'Configure extra usage to keep working when limits are hit',
  isEnabled: () => isExtraUsageAllowed() && isNonInteractiveSession(),
  get isHidden() {
    return !isNonInteractiveSession()
  },
  load: () => import('./extra-usage-noninteractive.js'),
} satisfies Command
