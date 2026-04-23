export {
  createHeadlessSessionContext,
  handleChannelEnable,
  handleOrphanedPermissionResponse,
  handleSetPermissionMode,
  reregisterChannelHandlerAfterReconnect,
} from './headlessSessionControl.js'
import { runHeadlessRuntimeLoop } from './headlessRuntimeLoop.js'
import { createHeadlessSessionContext } from './headlessSessionControl.js'
import type { RuntimeBootstrapStateProvider } from '../../../core/state/providers.js'

type RunHeadlessArgs = Parameters<typeof runHeadlessRuntimeLoop> extends [
  ...infer Args,
  unknown,
]
  ? Args
  : never

export async function runHeadless(
  ...args: RunHeadlessArgs
): ReturnType<typeof runHeadlessRuntimeLoop> {
  const bootstrapStateProvider = args.at(-1) as unknown as RuntimeBootstrapStateProvider
  const runtimeArgs = args.slice(0, -1) as Parameters<
    typeof runHeadlessRuntimeLoop
  > extends [...infer Args, RuntimeBootstrapStateProvider, unknown]
    ? Args
    : never
  const session = createHeadlessSessionContext(bootstrapStateProvider)
  return runHeadlessRuntimeLoop(
    ...runtimeArgs,
    bootstrapStateProvider,
    session,
  )
}
