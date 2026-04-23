/**
 * CLI compatibility wrapper for the runtime-owned headless execution stack.
 *
 * CLI remains the first-class host, but the reusable headless implementation
 * now lives under runtime/capabilities/execution/internal.
 */
export {
  reconcileMcpServers,
  handleMcpSetServers,
} from '../runtime/capabilities/execution/internal/headlessMcp.js'
export { handleOrphanedPermissionResponse } from '../runtime/capabilities/execution/internal/headlessSession.js'
export {
  canBatchWith,
  createCanUseToolWithPermissionPrompt,
  getCanUseToolFn,
  joinPromptValues,
} from '../runtime/capabilities/execution/internal/headlessControl.js'
export { removeInterruptedMessage } from '../runtime/capabilities/execution/internal/headlessBootstrap.js'
export type {
  DynamicMcpState,
  McpSetServersResult,
  SdkMcpState,
} from '../runtime/capabilities/execution/internal/headlessMcp.js'
export { runHeadless } from '../runtime/capabilities/execution/internal/headlessSession.js'
