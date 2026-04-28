import {
  connectDefaultKernelHeadlessMcp,
  createDefaultKernelHeadlessEnvironment,
  prepareKernelHeadlessStartup,
  runKernelHeadless,
  type KernelHeadlessInput,
  type KernelHeadlessRunOptions,
  type PrepareKernelHeadlessStartupDeps,
  type PrepareKernelHeadlessStartupOptions,
} from './headlessKernelDeps.js'
import type { ScopedMcpServerConfig } from '../../../services/mcp/types.js'
import {
  materializeRuntimeHeadlessEnvironment,
  type RuntimeHeadlessEnvironmentInput,
} from '../../../runtime/capabilities/execution/headlessCapabilityMaterializer.js'
import {
  createBootstrapStateProvider,
  createRuntimeHeadlessStartupStateWriter,
} from '../../../runtime/core/state/bootstrapProvider.js'

export type HeadlessLaunchOptions = {
  inputPrompt: KernelHeadlessInput
  environment: RuntimeHeadlessEnvironmentInput
  regularMcpConfigs: Record<string, ScopedMcpServerConfig>
  claudeaiConfigPromise: Promise<Record<string, ScopedMcpServerConfig>>
  startup: PrepareKernelHeadlessStartupOptions
  startupDeps: PrepareKernelHeadlessStartupDeps
  runOptions: KernelHeadlessRunOptions
  profileCheckpoint(checkpoint: string): void
}

export type HeadlessLaunchDeps = {
  materializeRuntimeHeadlessEnvironment: typeof materializeRuntimeHeadlessEnvironment
  createDefaultKernelHeadlessEnvironment: typeof createDefaultKernelHeadlessEnvironment
  connectDefaultKernelHeadlessMcp: typeof connectDefaultKernelHeadlessMcp
  prepareKernelHeadlessStartup: typeof prepareKernelHeadlessStartup
  runKernelHeadless: typeof runKernelHeadless
}

const defaultDeps: HeadlessLaunchDeps = {
  materializeRuntimeHeadlessEnvironment,
  createDefaultKernelHeadlessEnvironment,
  connectDefaultKernelHeadlessMcp,
  prepareKernelHeadlessStartup,
  runKernelHeadless,
}

export async function runHeadlessLaunch(
  options: HeadlessLaunchOptions,
  deps: HeadlessLaunchDeps = defaultDeps,
): Promise<void> {
  const bootstrapStateProvider = createBootstrapStateProvider()
  const environment = await deps.materializeRuntimeHeadlessEnvironment(
    options.environment,
  )
  const headlessEnvironment =
    deps.createDefaultKernelHeadlessEnvironment(environment)

  options.profileCheckpoint('before_connectMcp')
  await deps.connectDefaultKernelHeadlessMcp({
    store: headlessEnvironment.store,
    regularMcpConfigs: options.regularMcpConfigs,
    claudeaiConfigPromise: options.claudeaiConfigPromise,
  })
  options.profileCheckpoint('after_connectMcp')
  options.profileCheckpoint('after_connectMcp_claudeai')

  await deps.prepareKernelHeadlessStartup(options.startup, {
    ...options.startupDeps,
    stateWriter: createRuntimeHeadlessStartupStateWriter(
      bootstrapStateProvider.runWithState,
    ),
  })

  await deps.runKernelHeadless(
    options.inputPrompt,
    headlessEnvironment,
    {
      ...options.runOptions,
      bootstrapStateProvider,
    },
  )
}
