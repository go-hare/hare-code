/**
 * Stable daemon-facing kernel exports.
 *
 * These are thin façades over the runtime daemon capability so callers do not
 * need to import from runtime internals directly.
 */
import {
  EXIT_CODE_PERMANENT,
  EXIT_CODE_TRANSIENT,
  buildRemoteControlWorkerConfigFromEnv,
  runDaemonWorkerRuntime,
  runRemoteControlWorkerRuntime,
  type HeadlessBridgeRunner,
  type RemoteControlWorkerRuntimeConfig,
} from '../runtime/capabilities/daemon/DaemonWorkerRuntime.js'
import {
  BridgeHeadlessPermanentError,
  runBridgeHeadless,
} from './bridge.js'

export function createDaemonWorkerDeps(): {
  runBridgeHeadless: HeadlessBridgeRunner
  isPermanentError: (error: unknown) => boolean
} {
  return {
    runBridgeHeadless,
    isPermanentError: error => error instanceof BridgeHeadlessPermanentError,
  }
}

export async function runDaemonWorker(kind?: string): Promise<void> {
  return runDaemonWorkerRuntime(kind, createDaemonWorkerDeps())
}

export {
  EXIT_CODE_PERMANENT,
  EXIT_CODE_TRANSIENT,
  buildRemoteControlWorkerConfigFromEnv,
  runDaemonWorkerRuntime,
  runRemoteControlWorkerRuntime,
  type HeadlessBridgeRunner,
  type RemoteControlWorkerRuntimeConfig,
}
