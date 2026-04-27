import { primeRuntimeCommandSources } from '../runtime/capabilities/commands/RuntimeCommandSources.js'
import {
  preloadRuntimeCommandAssembly,
  resolvePreloadedRuntimeCommandAssembly,
  type RuntimeCommandAssemblyPreload,
  type RuntimeCommandAssemblyResult,
} from '../runtime/capabilities/execution/headlessCapabilityMaterializer.js'

export function primeBundledCommandSources(entrypoint?: string): void {
  primeRuntimeCommandSources(entrypoint)
}

export function preloadCommandAssembly(
  preSetupCwd: string,
  worktreeEnabled: boolean,
): RuntimeCommandAssemblyPreload {
  return preloadRuntimeCommandAssembly({
    cwd: preSetupCwd,
    enabled: !worktreeEnabled,
  })
}

export async function resolveCommandAssembly(options: {
  currentCwd: string
  preloaded: RuntimeCommandAssemblyPreload
}): Promise<RuntimeCommandAssemblyResult> {
  return resolvePreloadedRuntimeCommandAssembly(options)
}
