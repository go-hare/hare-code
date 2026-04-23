export {
  hasReceivedMessageUuid,
  handleChannelEnable,
  handleOrphanedPermissionResponse,
  handleSetPermissionMode,
  reregisterChannelHandlerAfterReconnect,
  trackReceivedMessageUuid,
} from './headlessSessionControl.js'
import { runHeadlessRuntimeLoop } from './headlessRuntimeLoop.js'

export async function runHeadless(
  ...args: Parameters<typeof runHeadlessRuntimeLoop>
): ReturnType<typeof runHeadlessRuntimeLoop> {
  return runHeadlessRuntimeLoop(...args)
}
