import type { Command } from '../commands.js'
import { getCommands } from '../commands.js'
import { primeRuntimeCommandSources } from '../runtime/capabilities/commands/RuntimeCommandSources.js'
import {
  materializeRuntimeCommandAssembly,
  type RuntimeCommandAssemblyResult,
} from '../runtime/capabilities/execution/headlessCapabilityMaterializer.js'
import { getAgentDefinitionsWithOverrides } from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'

type AgentDefinitionsResult = Awaited<
  ReturnType<typeof getAgentDefinitionsWithOverrides>
>

export type PreloadedCommandAssembly = {
  commandsPromise: Promise<Command[]> | null
  agentDefinitionsPromise: Promise<AgentDefinitionsResult> | null
}

export function primeBundledCommandSources(entrypoint?: string): void {
  primeRuntimeCommandSources(entrypoint)
}

export function preloadCommandAssembly(
  preSetupCwd: string,
  worktreeEnabled: boolean,
): PreloadedCommandAssembly {
  const commandsPromise = worktreeEnabled ? null : getCommands(preSetupCwd)
  const agentDefinitionsPromise = worktreeEnabled
    ? null
    : getAgentDefinitionsWithOverrides(preSetupCwd)

  // Suppress transient unhandledRejection if these reject before the later
  // Promise.all join in main.tsx.
  commandsPromise?.catch(() => {})
  agentDefinitionsPromise?.catch(() => {})

  return { commandsPromise, agentDefinitionsPromise }
}

export async function resolveCommandAssembly(options: {
  currentCwd: string
  preloaded: PreloadedCommandAssembly
}): Promise<RuntimeCommandAssemblyResult> {
  const { currentCwd, preloaded } = options

  const [commands, agentDefinitionsResult] = await Promise.all([
    preloaded.commandsPromise ?? getCommands(currentCwd),
    preloaded.agentDefinitionsPromise ??
      getAgentDefinitionsWithOverrides(currentCwd),
  ])

  return materializeRuntimeCommandAssembly({
    cwd: currentCwd,
    commands,
    agentDefinitionsResult,
  })
}
