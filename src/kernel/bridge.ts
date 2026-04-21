/**
 * Stable bridge-facing kernel exports.
 *
 * This keeps external hosts off internal runtime paths while reusing the
 * existing bridge capability implementation.
 */
export {
  runBridgeCliRuntime,
  runBridgeHeadlessRuntime,
  createBridgePersistenceOwner,
  createBridgeRuntimeCapability,
  type BridgeCliEntry,
  type BridgeHeadlessEntry,
  type BridgeRuntimeCapability,
} from '../runtime/capabilities/bridge/BridgeRuntime.js'
export {
  runHeadlessBridgeRuntime,
} from '../runtime/capabilities/bridge/HeadlessBridgeEntry.js'
export {
  BridgeHeadlessPermanentError,
  createHeadlessBridgeLogger,
  type HeadlessBridgeOpts,
} from '../runtime/capabilities/bridge/HeadlessBridgeRuntime.js'
export {
  archiveBridgeSessionRuntime,
  createBridgeSessionRuntime,
  getBridgeSessionRuntime,
  updateBridgeSessionTitleRuntime,
} from '../runtime/capabilities/bridge/SessionApi.js'
