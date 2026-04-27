import type { Tool, ToolUseContext } from '../../Tool.js'
import type {
  KernelPermissionRequest,
  KernelPermissionRisk,
} from '../../runtime/contracts/permissions.js'
import type {
  PermissionDecision,
  PermissionDecisionReason,
} from './PermissionResult.js'
import type { ToolPermissionRuntimeContext } from '../../types/runtimePermission.js'

export function createToolPermissionRuntimeRequest(args: {
  tool: Tool
  input: Record<string, unknown>
  toolUseContext: ToolUseContext
  toolUseID: string
  permissionResult?: PermissionDecision
  runtimePermission?: ToolPermissionRuntimeContext
}): KernelPermissionRequest {
  const metadata: Record<string, unknown> = {
    isMcp: args.tool.isMcp ?? false,
    isLsp: args.tool.isLsp ?? false,
  }
  if (args.permissionResult?.behavior === 'ask') {
    if (args.permissionResult.suggestions !== undefined) {
      metadata.permission_suggestions = args.permissionResult.suggestions
    }
    if (args.permissionResult.blockedPath !== undefined) {
      metadata.blocked_path = args.permissionResult.blockedPath
    }
    const serializedReason = serializeDecisionReason(
      args.permissionResult.decisionReason,
    )
    if (serializedReason !== undefined) {
      metadata.decision_reason = serializedReason
    }
  }
  if (args.toolUseContext.agentId !== undefined) {
    metadata.agent_id = args.toolUseContext.agentId
  }

  const runtimePermission =
    args.runtimePermission ?? args.toolUseContext.runtimePermission
  const request: KernelPermissionRequest = {
    permissionRequestId: args.toolUseID,
    conversationId:
      runtimePermission?.getConversationId?.() ??
      args.toolUseContext.agentId ??
      'runtime',
    toolName: args.tool.name,
    action: 'tool.call',
    argumentsPreview: args.input,
    risk: inferPermissionRisk(args.tool, args.input),
    policySnapshot: createPolicySnapshot(args.toolUseContext),
    metadata,
  }
  const turnId = runtimePermission?.getTurnId?.()
  if (turnId !== undefined) {
    request.turnId = turnId
  }
  return request
}

function serializeDecisionReason(
  reason: PermissionDecisionReason | undefined,
): Record<string, unknown> | undefined {
  if (!reason) {
    return undefined
  }
  if (reason.type === 'subcommandResults') {
    return { type: reason.type }
  }
  return { ...reason }
}

function inferPermissionRisk(
  tool: Tool,
  input: Record<string, unknown>,
): KernelPermissionRisk {
  if (safeToolPredicate(() => tool.isDestructive?.(input) ?? false)) {
    return 'destructive'
  }
  if (safeToolPredicate(() => tool.isOpenWorld?.(input) ?? false)) {
    return 'high'
  }
  if (!safeToolPredicate(() => tool.isReadOnly(input))) {
    return 'medium'
  }
  return 'low'
}

function createPolicySnapshot(
  toolUseContext: ToolUseContext,
): Record<string, unknown> {
  const context = toolUseContext.getAppState().toolPermissionContext
  return {
    mode: context.mode,
    isBypassPermissionsModeAvailable: context.isBypassPermissionsModeAvailable,
    isNonInteractiveSession: toolUseContext.options.isNonInteractiveSession,
  }
}

function safeToolPredicate(predicate: () => boolean): boolean {
  try {
    return predicate()
  } catch {
    return false
  }
}
