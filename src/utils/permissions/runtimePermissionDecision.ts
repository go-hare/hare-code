import type { Tool, ToolUseContext } from '../../Tool.js'
import type {
  KernelPermissionDecision,
  KernelPermissionDecisionSource,
  KernelPermissionDecisionValue,
} from '../../runtime/contracts/permissions.js'
import type {
  PermissionDecision,
  PermissionDecisionReason,
} from './PermissionResult.js'
import { permissionPromptToolResultToPermissionDecision } from './PermissionPromptToolResultSchema.js'
import type { Output as PermissionToolOutput } from './PermissionPromptToolResultSchema.js'

export function permissionDecisionFromKernelDecision(args: {
  decision: KernelPermissionDecision
  tool: Tool
  input: Record<string, unknown>
  toolUseContext: ToolUseContext
  toolUseID: string
}): PermissionDecision {
  const result = permissionToolOutputFromKernelDecision(
    args.decision,
    args.input,
    args.toolUseID,
  )
  const legacyDecision = permissionPromptToolResultToPermissionDecision(
    result,
    args.tool,
    args.input,
    args.toolUseContext,
  )
  return {
    ...legacyDecision,
    decisionReason: {
      type: 'permissionPromptTool',
      permissionPromptToolName: 'runtime-permission-broker',
      toolResult: result,
    },
  }
}

export function kernelDecisionFromPermissionDecision(
  decision: PermissionDecision,
  permissionRequestId: string,
  resolvedBy: string,
): KernelPermissionDecision {
  const decidedBy = inferDecisionSource(decision.decisionReason, resolvedBy)

  if (decision.behavior === 'allow') {
    return {
      permissionRequestId,
      decision: mapAllowDecision(decidedBy, decision.decisionReason),
      decidedBy,
      reason: formatDecisionReason(decision.decisionReason),
      metadata: {
        resolvedBy,
        updatedInput: decision.updatedInput,
        ...permissionToolOutputMetadata(decision.decisionReason),
      },
    }
  }

  if (decision.behavior === 'deny') {
    return {
      permissionRequestId,
      decision: 'deny',
      decidedBy,
      reason: decision.message || formatDecisionReason(decision.decisionReason),
      metadata: {
        resolvedBy,
        ...permissionToolOutputMetadata(decision.decisionReason),
      },
    }
  }

  return {
    permissionRequestId,
    decision: 'abort',
    decidedBy: 'runtime',
    reason: decision.message,
    metadata: { resolvedBy },
  }
}

function permissionToolOutputFromKernelDecision(
  decision: KernelPermissionDecision,
  input: Record<string, unknown>,
  toolUseID: string,
): PermissionToolOutput {
  const metadataOutput = permissionToolOutputFromMetadata(decision.metadata)
  if (metadataOutput) {
    return metadataOutput
  }

  if (isKernelPermissionAllowed(decision.decision)) {
    return {
      behavior: 'allow',
      updatedInput: input,
      toolUseID,
      decisionClassification:
        decision.decision === 'allow_session'
          ? 'user_permanent'
          : 'user_temporary',
    }
  }

  return {
    behavior: 'deny',
    message: decision.reason ?? 'Permission denied',
    interrupt: decision.decision === 'abort',
    toolUseID,
    decisionClassification: 'user_reject',
  }
}

function permissionToolOutputFromMetadata(
  metadata: KernelPermissionDecision['metadata'],
): PermissionToolOutput | undefined {
  const output =
    metadata &&
    typeof metadata === 'object' &&
    'permissionToolOutput' in metadata
      ? metadata.permissionToolOutput
      : undefined
  if (!output || typeof output !== 'object') {
    return undefined
  }

  const candidate = output as Partial<PermissionToolOutput>
  if (candidate.behavior === 'allow' && isRecord(candidate.updatedInput)) {
    return candidate as PermissionToolOutput
  }
  if (candidate.behavior === 'deny' && typeof candidate.message === 'string') {
    return candidate as PermissionToolOutput
  }
  return undefined
}

function permissionToolOutputMetadata(
  reason: PermissionDecisionReason | undefined,
): Record<string, unknown> {
  if (reason?.type !== 'permissionPromptTool') {
    return {}
  }
  return {
    permissionToolOutput: reason.toolResult,
  }
}

function inferDecisionSource(
  reason: PermissionDecisionReason | undefined,
  resolvedBy: string,
): KernelPermissionDecisionSource {
  if (reason?.type === 'mode' || reason?.type === 'rule') {
    return 'policy'
  }
  if (reason?.type === 'permissionPromptTool') {
    return 'host'
  }
  if (reason?.type === 'hook' || reason?.type === 'classifier') {
    return 'runtime'
  }
  if (
    resolvedBy === 'user' ||
    resolvedBy === 'interactive' ||
    resolvedBy === 'bridge' ||
    resolvedBy === 'repl_bridge_remote' ||
    resolvedBy === 'channel' ||
    resolvedBy === 'pipe' ||
    resolvedBy === 'runtime_broker'
  ) {
    return 'host'
  }
  return 'runtime'
}

function mapAllowDecision(
  decidedBy: KernelPermissionDecisionSource,
  reason: PermissionDecisionReason | undefined,
): KernelPermissionDecisionValue {
  const classification = getPermissionPromptClassification(reason)
  if (classification === 'user_permanent') {
    return 'allow_session'
  }
  if (classification === 'user_temporary' || decidedBy === 'host') {
    return 'allow_once'
  }
  return 'allow'
}

function getPermissionPromptClassification(
  reason: PermissionDecisionReason | undefined,
): 'user_temporary' | 'user_permanent' | 'user_reject' | undefined {
  if (reason?.type !== 'permissionPromptTool') {
    return undefined
  }
  const result = reason.toolResult
  if (!result || typeof result !== 'object') {
    return undefined
  }
  const classification = (result as Record<string, unknown>)
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

function isKernelPermissionAllowed(
  decision: KernelPermissionDecisionValue,
): boolean {
  return (
    decision === 'allow' ||
    decision === 'allow_once' ||
    decision === 'allow_session'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
