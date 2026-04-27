import type { CanUseToolFn } from '../../../hooks/useCanUseTool.js'
import type { ToolPermissionRuntimeContext } from '../../../types/runtimePermission.js'
import { createToolPermissionRuntimeContext } from '../../../utils/permissions/runtimePermissionBroker.js'
import { RuntimeEventBus } from '../../core/events/RuntimeEventBus.js'
import {
  RuntimePermissionBroker,
  type RuntimePermissionBrokerOptions,
} from './RuntimePermissionBroker.js'
import { wrapCanUseToolWithRuntimePermissions } from './RuntimePermissionCanUseToolAdapter.js'

export type RuntimePermissionServiceOptions = {
  runtimeId: string
  eventBus?: RuntimeEventBus
  permissionBroker?: RuntimePermissionBroker
  brokerOptions?: Omit<RuntimePermissionBrokerOptions, 'eventBus'>
  getConversationId?: () => string
  getTurnId?: () => string | undefined
}

export type RuntimePermissionContextOptions = {
  getConversationId?: () => string
  getTurnId?: () => string | undefined
}

export type RuntimePermissionService = {
  readonly eventBus: RuntimeEventBus
  readonly broker: RuntimePermissionBroker
  createToolUseContext(
    options?: RuntimePermissionContextOptions,
  ): ToolPermissionRuntimeContext
  wrapCanUseTool(
    canUseTool: CanUseToolFn,
    options?: RuntimePermissionContextOptions & {
      alreadyUsesBroker?: boolean
    },
  ): CanUseToolFn
  dispose(reason?: string): void
}

export function createRuntimePermissionService(
  options: RuntimePermissionServiceOptions,
): RuntimePermissionService {
  const eventBus =
    options.eventBus ??
    new RuntimeEventBus({
      runtimeId: options.runtimeId,
    })
  const broker =
    options.permissionBroker ??
    new RuntimePermissionBroker({
      ...options.brokerOptions,
      eventBus,
    })

  function getConversationId(
    contextOptions?: RuntimePermissionContextOptions,
  ): () => string {
    return (
      contextOptions?.getConversationId ??
      options.getConversationId ??
      (() => options.runtimeId)
    )
  }

  function getTurnId(
    contextOptions?: RuntimePermissionContextOptions,
  ): (() => string | undefined) | undefined {
    return contextOptions?.getTurnId ?? options.getTurnId
  }

  return {
    eventBus,
    broker,
    createToolUseContext(contextOptions) {
      return createToolPermissionRuntimeContext({
        permissionBroker: broker,
        getConversationId: getConversationId(contextOptions),
        getTurnId: getTurnId(contextOptions),
      })
    },
    wrapCanUseTool(canUseTool, contextOptions) {
      if (contextOptions?.alreadyUsesBroker) {
        return canUseTool
      }
      return wrapCanUseToolWithRuntimePermissions(canUseTool, {
        broker,
        getConversationId: getConversationId(contextOptions),
        getTurnId: getTurnId(contextOptions),
      })
    },
    dispose(reason = 'Runtime permission service disposed') {
      broker.dispose(reason)
    },
  }
}
