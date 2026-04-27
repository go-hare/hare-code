import type {
  KernelPermissionDecision,
  KernelPermissionRequest,
} from '../runtime/contracts/permissions.js'
import type { PermissionDecision } from './permissions.js'

export type ToolPermissionRuntimeBroker = {
  requestPermission(
    request: KernelPermissionRequest,
  ): Promise<KernelPermissionDecision>
  decide(decision: KernelPermissionDecision): KernelPermissionDecision
}

export type ToolPermissionRuntimeController = {
  start(permissionResult?: PermissionDecision): Promise<PermissionDecision> | undefined
  decide(
    decision: PermissionDecision,
    resolvedBy: string,
    permissionResult?: PermissionDecision,
  ): void
}

export type ToolPermissionRuntimeContext = {
  permissionBroker?: ToolPermissionRuntimeBroker
  getConversationId?: () => string
  getTurnId?: () => string | undefined
  controllers?: Map<string, ToolPermissionRuntimeController>
}
