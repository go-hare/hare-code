export {
  createHeadlessSessionContext,
  handleChannelEnable,
  handleOrphanedPermissionResponse,
  handleSetPermissionMode,
  reregisterChannelHandlerAfterReconnect,
} from './headlessSessionControl.js'
import { runHeadlessRuntimeLoop } from './headlessRuntimeLoop.js'
import {
  createHeadlessSessionContext,
  type HeadlessSessionStateProvider,
} from './headlessSessionControl.js'

type RunHeadlessArgs = Parameters<typeof runHeadlessRuntimeLoop> extends [
  ...infer Args,
  unknown,
]
  ? Args
  : never

export async function runHeadless(
  ...args: RunHeadlessArgs
): ReturnType<typeof runHeadlessRuntimeLoop> {
  const bootstrapStateProvider =
    args.at(-1) as unknown as HeadlessSessionStateProvider
  const runtimeArgs = args.slice(0, -1) as Parameters<
    typeof runHeadlessRuntimeLoop
  > extends [...infer Args, HeadlessSessionStateProvider, unknown]
    ? Args
    : never
  const session = createHeadlessSessionContext(bootstrapStateProvider)
  return bootstrapStateProvider.runWithState(() =>
    runHeadlessRuntimeLoop(
      ...runtimeArgs,
      bootstrapStateProvider,
      session,
    ),
  )
}
