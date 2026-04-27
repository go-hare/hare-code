import type { CanUseToolFn } from 'src/hooks/useCanUseTool.js'
import type { Tool, ToolUseContext } from 'src/Tool.js'
import type { AssistantMessage } from 'src/types/message.js'
import type {
  PermissionDecision,
  PermissionDecisionReason,
} from 'src/utils/permissions/PermissionResult.js'
import type {
  KernelPermissionDecision,
  KernelPermissionDecisionSource,
  KernelPermissionDecisionValue,
  KernelPermissionRequest,
  KernelPermissionRisk,
} from '../../contracts/permissions.js'
import type { RuntimePermissionBroker } from './RuntimePermissionBroker.js'

export type RuntimePermissionCanUseToolAdapterOptions = {
  broker: Pick<RuntimePermissionBroker, 'requestPermission' | 'decide'>
  getConversationId: () => string
  getTurnId?: () => string | undefined
  getPolicySnapshot?: (
    context: ToolUseContext,
    tool: Tool,
    input: Record<string, unknown>,
  ) => Record<string, unknown>
}

type PermissionPromptClassification =
  | 'user_temporary'
  | 'user_permanent'
  | 'user_reject'

export function wrapCanUseToolWithRuntimePermissions(
  canUseTool: CanUseToolFn,
  options: RuntimePermissionCanUseToolAdapterOptions,
): CanUseToolFn {
  return async (
    tool,
    input,
    toolUseContext,
    assistantMessage,
    toolUseId,
    forceDecision,
  ) => {
    const request = createRuntimePermissionRequest({
      tool,
      input,
      toolUseContext,
      toolUseId,
      options,
    })
    const auditStarted = startPermissionAudit(options.broker, request)

    try {
      const decision = await canUseTool(
        tool,
        input,
        toolUseContext,
        assistantMessage,
        toolUseId,
        forceDecision,
      )
      if (auditStarted) {
        recordPermissionDecision(
          options.broker,
          request,
          mapPermissionDecision(decision),
        )
      }
      return decision
    } catch (error) {
      if (auditStarted) {
        recordPermissionDecision(options.broker, request, {
          permissionRequestId: request.permissionRequestId,
          decision: 'deny',
          decidedBy: 'runtime',
          reason: `Permission check failed: ${formatError(error)}`,
        })
      }
      throw error
    }
  }
}

function createRuntimePermissionRequest(args: {
  tool: Tool
  input: Record<string, unknown>
  toolUseContext: ToolUseContext
  toolUseId: string
  options: RuntimePermissionCanUseToolAdapterOptions
}): KernelPermissionRequest {
  const request: KernelPermissionRequest = {
    permissionRequestId: args.toolUseId,
    conversationId: args.options.getConversationId(),
    toolName: args.tool.name,
    action: 'tool.call',
    argumentsPreview: args.input,
    risk: inferPermissionRisk(args.tool, args.input),
    policySnapshot:
      args.options.getPolicySnapshot?.(
        args.toolUseContext,
        args.tool,
        args.input,
      ) ?? defaultPolicySnapshot(args.toolUseContext),
    metadata: {
      isMcp: args.tool.isMcp ?? false,
      isLsp: args.tool.isLsp ?? false,
    },
  }
  const turnId = args.options.getTurnId?.()
  if (turnId !== undefined) {
    request.turnId = turnId
  }
  return request
}

function startPermissionAudit(
  broker: RuntimePermissionCanUseToolAdapterOptions['broker'],
  request: KernelPermissionRequest,
): boolean {
  try {
    void broker.requestPermission(request)
    return true
  } catch {
    return false
  }
}

function recordPermissionDecision(
  broker: RuntimePermissionCanUseToolAdapterOptions['broker'],
  request: KernelPermissionRequest,
  decision: Omit<KernelPermissionDecision, 'permissionRequestId'> & {
    permissionRequestId?: string
  },
): void {
  try {
    broker.decide({
      ...decision,
      permissionRequestId:
        decision.permissionRequestId || request.permissionRequestId,
    })
  } catch {
    // Permission audit must not alter the legacy canUseTool behavior.
  }
}

function mapPermissionDecision(
  decision: PermissionDecision,
): KernelPermissionDecision {
  const classification = getPermissionPromptClassification(
    decision.decisionReason,
  )
  const decidedBy = mapDecisionSource(decision.decisionReason)

  if (decision.behavior === 'allow') {
    return {
      permissionRequestId: decision.toolUseID ?? '',
      decision: mapAllowDecision(decidedBy, classification),
      decidedBy,
      reason: formatDecisionReason(decision.decisionReason),
    }
  }

  if (decision.behavior === 'deny') {
    return {
      permissionRequestId: decision.toolUseID ?? '',
      decision: 'deny',
      decidedBy,
      reason: decision.message || formatDecisionReason(decision.decisionReason),
    }
  }

  return {
    permissionRequestId: '',
    decision: 'abort',
    decidedBy: 'runtime',
    reason: decision.message || 'Legacy permission path returned ask',
  }
}

function mapAllowDecision(
  decidedBy: KernelPermissionDecisionSource,
  classification: PermissionPromptClassification | undefined,
): KernelPermissionDecisionValue {
  if (classification === 'user_permanent') {
    return 'allow_session'
  }
  if (classification === 'user_temporary' || decidedBy === 'host') {
    return 'allow_once'
  }
  return 'allow'
}

function mapDecisionSource(
  reason: PermissionDecisionReason | undefined,
): KernelPermissionDecisionSource {
  switch (reason?.type) {
    case 'permissionPromptTool':
      return 'host'
    case 'mode':
    case 'rule':
      return 'policy'
    default:
      return 'runtime'
  }
}

function getPermissionPromptClassification(
  reason: PermissionDecisionReason | undefined,
): PermissionPromptClassification | undefined {
  if (reason?.type !== 'permissionPromptTool') {
    return undefined
  }

  const toolResult = reason.toolResult
  if (!toolResult || typeof toolResult !== 'object') {
    return undefined
  }

  const classification = (toolResult as Record<string, unknown>)
    .decisionClassification
  if (
    classification === 'user_temporary' ||
    classification === 'user_permanent' ||
    classification === 'user_reject'
  ) {
    return classification
  }
  return undefined
}

function formatDecisionReason(
  reason: PermissionDecisionReason | undefined,
): string | undefined {
  if (!reason) {
    return undefined
  }

  switch (reason.type) {
    case 'mode':
      return `Permission mode ${reason.mode}`
    case 'rule':
      return `Permission rule ${reason.rule.ruleBehavior}`
    case 'permissionPromptTool':
      return `Permission prompt tool ${reason.permissionPromptToolName}`
    case 'hook':
      return reason.reason ?? `Permission hook ${reason.hookName}`
    case 'classifier':
      return reason.reason
    case 'asyncAgent':
    case 'sandboxOverride':
    case 'workingDir':
    case 'safetyCheck':
    case 'other':
      return reason.reason
    case 'subcommandResults':
      return 'Subcommand permission results'
  }
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

function safeToolPredicate(predicate: () => boolean): boolean {
  try {
    return predicate()
  } catch {
    return false
  }
}

function defaultPolicySnapshot(
  toolUseContext: ToolUseContext,
): Record<string, unknown> {
  const toolPermissionContext =
    toolUseContext.getAppState().toolPermissionContext
  return {
    mode: toolPermissionContext.mode,
    isBypassPermissionsModeAvailable:
      toolPermissionContext.isBypassPermissionsModeAvailable,
    shouldAvoidPermissionPrompts:
      toolPermissionContext.shouldAvoidPermissionPrompts ?? false,
    awaitAutomatedChecksBeforeDialog:
      toolPermissionContext.awaitAutomatedChecksBeforeDialog ?? false,
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}
