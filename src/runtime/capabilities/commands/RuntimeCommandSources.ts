import { initBuiltinPlugins } from '../../../plugins/bundled/index.js'
import { initBundledSkills } from '../../../skills/bundled/index.js'

let primed = false

export function primeRuntimeCommandSources(entrypoint?: string): void {
  if (entrypoint === 'local-agent' || primed) {
    return
  }

  initBuiltinPlugins()
  initBundledSkills()
  primed = true
}

export function resetRuntimeCommandSourcesForTests(): void {
  primed = false
}
