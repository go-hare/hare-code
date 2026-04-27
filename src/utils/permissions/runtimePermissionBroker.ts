import type { Tool, ToolUseContext } from '../../Tool.js'
import type { KernelPermissionRequest } from '../../runtime/contracts/permissions.js'
import type {
  ToolPermissionRuntimeContext,
  ToolPermissionRuntimeController,
} from '../../types/runtimePermission.js'
import type { PermissionDecision } from './PermissionResult.js'
import { logForDebugging } from '../debug.js'
import {
  kernelDecisionFromPermissionDecision,
  permissionDecisionFromKernelDecision,
} from './runtimePermissionDecision.js'
import { createToolPermissionRuntimeRequest } from './runtimePermissionRequest.js'

export function ensureToolPermissionRuntimeController(args: {
  tool: Tool
  input: Record<string, unknown>
  toolUseContext: ToolUseContext
  toolUseID: string
  permissionResult?: PermissionDecision
  runtimePermission?: ToolPermissionRuntimeContext
}): ToolPermissionRuntimeController | undefined {
  const runtimePermission =
    args.runtimePermission ?? args.toolUseContext.runtimePermission
  if (!runtimePermission?.permissionBroker) {
    return undefined
  }

  runtimePermission.controllers ??= new Map()
  const existing = runtimePermission.controllers.get(args.toolUseID)
  if (existing) {
    return existing
  }

  const controller = createToolPermissionRuntimeController({
    ...args,
    runtimePermission,
  })
  runtimePermission.controllers.set(args.toolUseID, controller)
  return controller
}

export function createToolPermissionRuntimeContext(
  context: Omit<ToolPermissionRuntimeContext, 'controllers'>,
): ToolPermissionRuntimeContext {
  return {
    ...context,
    controllers: new Map(),
  }
}

function createToolPermissionRuntimeController(args: {
  tool: Tool
  input: Record<string, unknown>
  toolUseContext: ToolUseContext
  toolUseID: string
  permissionResult?: PermissionDecision
  runtimePermission: ToolPermissionRuntimeContext
}): ToolPermissionRuntimeController {
  let request: KernelPermissionRequest | undefined
  let promise: Promise<PermissionDecision> | undefined

  const ensureRequest = (permissionResult?: PermissionDecision) => {
    request ??= createToolPermissionRuntimeRequest({
      ...args,
      permissionResult,
      runtimePermission: args.runtimePermission,
    })
    return request
  }

  return {
    start(permissionResult) {
      if (promise) {
        return promise
      }

      const broker = args.runtimePermission.permissionBroker
      if (!broker) {
        return undefined
      }

      const currentRequest = ensureRequest(permissionResult)
      try {
        promise = broker
          .requestPermission(currentRequest)
          .then(decision =>
            permissionDecisionFromKernelDecision({
              decision,
              tool: args.tool,
              input: args.input,
              toolUseContext: args.toolUseContext,
              toolUseID: args.toolUseID,
            }),
          )
        return promise
      } catch (error) {
        logForDebugging(
          `Runtime permission broker request failed: ${formatError(error)}`,
          { level: 'warn' },
        )
        return undefined
      }
    },
    decide(decision, resolvedBy, permissionResult) {
      const broker = args.runtimePermission.permissionBroker
      if (!broker) {
        return
      }

      const currentRequest = ensureRequest(permissionResult)
      try {
        broker.decide(
          kernelDecisionFromPermissionDecision(
            decision,
            currentRequest.permissionRequestId,
            resolvedBy,
          ),
        )
      } catch {
        // Another racer may already have resolved this request. Permission
        // broker bookkeeping must not alter the legacy decision path.
      }
    },
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}
