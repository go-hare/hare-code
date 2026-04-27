import type {
  PermissionAllowDecision,
  PermissionAskDecision,
  PermissionDenyDecision,
} from '../../types/permissions.js'
import type { Tool as ToolType, ToolUseContext } from '../../Tool.js'
import { ensureToolPermissionRuntimeController } from '../../utils/permissions/runtimePermissionBroker.js'

export function recordAcpRuntimePermissionDecision(args: {
  tool: ToolType
  input: Record<string, unknown>
  context: ToolUseContext
  toolUseID: string
  permissionResult?: PermissionAskDecision
  decision: PermissionAllowDecision | PermissionDenyDecision
}): void {
  const controller = ensureToolPermissionRuntimeController({
    tool: args.tool,
    input: args.input,
    toolUseContext: args.context,
    toolUseID: args.toolUseID,
    permissionResult: args.permissionResult,
  })
  controller?.decide(args.decision, 'acp', args.permissionResult)
}
