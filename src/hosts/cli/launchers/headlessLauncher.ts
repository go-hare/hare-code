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

export async function runHeadlessLaunch(
  options: HeadlessLaunchOptions,
): Promise<void> {
  const environment = await materializeRuntimeHeadlessEnvironment(
    options.environment,
  )
  const headlessEnvironment =
    createDefaultKernelHeadlessEnvironment(environment)

  options.profileCheckpoint('before_connectMcp')
  await connectDefaultKernelHeadlessMcp({
    store: headlessEnvironment.store,
    regularMcpConfigs: options.regularMcpConfigs,
    claudeaiConfigPromise: options.claudeaiConfigPromise,
  })
  options.profileCheckpoint('after_connectMcp')
  options.profileCheckpoint('after_connectMcp_claudeai')

  await prepareKernelHeadlessStartup(options.startup, options.startupDeps)

  void runKernelHeadless(
    options.inputPrompt,
    headlessEnvironment,
    options.runOptions,
  )
}
