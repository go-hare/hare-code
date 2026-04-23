/**
 * Stable daemon-facing kernel exports.
 *
 * These are thin façades over the runtime daemon capability so callers do not
 * need to import from runtime internals directly.
 */
import {
  runDaemonWorkerRuntime,
} from '../runtime/capabilities/daemon/DaemonWorkerRuntime.js'
import type {
  DaemonWorkerRuntimeDeps,
} from '../runtime/capabilities/daemon/contracts.js'
import {
  runBridgeHeadless,
} from './bridge.js'
import { BridgeHeadlessPermanentError } from '../runtime/capabilities/bridge/HeadlessBridgeRuntime.js'

export function createDaemonWorkerDeps(): DaemonWorkerRuntimeDeps {
  return {
    runBridgeHeadless,
    isPermanentError: error => error instanceof BridgeHeadlessPermanentError,
  }
}

export async function runDaemonWorker(kind?: string): Promise<void> {
  return runDaemonWorkerRuntime(kind, createDaemonWorkerDeps())
}
