/**
 * Stable daemon-facing kernel exports.
 *
 * These are thin façades over the runtime daemon capability so callers do not
 * need to import from runtime internals directly.
 */
export {
  buildRemoteControlWorkerConfigFromEnv,
  runDaemonWorkerRuntime,
  runRemoteControlWorkerRuntime,
  EXIT_CODE_PERMANENT,
  EXIT_CODE_TRANSIENT,
  type HeadlessBridgeRunner,
  type RemoteControlWorkerRuntimeConfig,
} from '../runtime/capabilities/daemon/DaemonWorkerRuntime.js'
