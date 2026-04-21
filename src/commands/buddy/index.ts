import type { Command } from '../../commands.js'
import { isBuddyEnabled } from '../../buddy/enabled.js'

function isBuddyLive(): boolean {
  if (!isBuddyEnabled()) {
    return false
  }
  if (process.env.USER_TYPE === 'ant') return true
  const d = new Date()
  return d.getFullYear() > 2026 || (d.getFullYear() === 2026 && d.getMonth() >= 3)
}

const buddy = {
  type: 'local-jsx',
  name: 'buddy',
  description: 'Hatch and interact with your AI buddy',
  argumentHint: '[hatch|card|rehatch|pet|mute|unmute]',
  immediate: true,
  get isHidden() {
    return !isBuddyLive()
  },
  load: () => import('./buddy.js'),
} satisfies Command

export default buddy
