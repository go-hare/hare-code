import type { KernelRuntimeEventSink } from '../../../contracts/events.js'
import { RuntimeEventBus } from '../../../core/events/RuntimeEventBus.js'
import type { RuntimePermissionBroker } from '../../permissions/RuntimePermissionBroker.js'
import { createRuntimePermissionService } from '../../permissions/RuntimePermissionService.js'
import type { CanUseToolFn } from 'src/hooks/useCanUseTool.js'

export type HeadlessRuntimeEventSink = KernelRuntimeEventSink

export type HeadlessPermissionRuntimeOptions = {
  runtimeId: string
  getConversationId: () => string
  canUseTool: CanUseToolFn
  eventBus?: RuntimeEventBus
  runtimeEventSink?: HeadlessRuntimeEventSink
  permissionBroker?: RuntimePermissionBroker
  canUseToolUsesBroker?: boolean
}

export type HeadlessPermissionRuntime = {
  canUseTool: CanUseToolFn
  dispose(reason?: string): void
}

export function createHeadlessPermissionRuntime(
  options: HeadlessPermissionRuntimeOptions,
): HeadlessPermissionRuntime {
  const eventBus =
    options.eventBus ??
    new RuntimeEventBus({
      runtimeId: options.runtimeId,
    })
  const unsubscribe =
    options.eventBus === undefined && options.runtimeEventSink !== undefined
      ? eventBus.subscribe(options.runtimeEventSink)
      : undefined
  const service = createRuntimePermissionService({
    runtimeId: options.runtimeId,
    eventBus,
    permissionBroker: options.permissionBroker,
    getConversationId: options.getConversationId,
  })

  return {
    canUseTool: service.wrapCanUseTool(options.canUseTool, {
      alreadyUsesBroker: options.canUseToolUsesBroker,
    }),
    dispose(reason = 'Headless permission runtime disposed') {
      unsubscribe?.()
      service.dispose(reason)
    },
  }
}
