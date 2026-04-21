import { feature } from 'bun:bundle'
import { isEnvDefinedFalsy, isEnvTruthy } from '../utils/envUtils.js'

export const BUDDY_ENABLE_ENV_VAR = 'CLAUDE_CODE_ENABLE_BUDDY'

export function isBuddyEnabled(): boolean {
  if (feature('BUDDY')) return true

  if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_ENABLE_BUDDY)) {
    return false
  }

  // External builds keep Buddy available by default so the restored feature
  // remains usable. Internal builds still respect the compile-time gate unless
  // explicitly re-enabled through the env var.
  if (process.env.USER_TYPE !== 'ant') {
    return true
  }

  return isEnvTruthy(process.env.CLAUDE_CODE_ENABLE_BUDDY)
}
