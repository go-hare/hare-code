import { feature } from 'bun:bundle'
import { getIsRemoteMode, getKairosActive, getMainThreadAgentType, getOriginalCwd, getSdkBetas, getSessionId } from '../bootstrap/state.js'
import { DEFAULT_OUTPUT_STYLE_NAME } from '../constants/outputStyles.js'
import { getTotalAPIDuration, getTotalCost, getTotalDuration, getTotalInputTokens, getTotalLinesAdded, getTotalLinesRemoved, getTotalOutputTokens } from '../cost-tracker.js'
import type { ReadonlySettings } from '../hooks/useSettings.js'
import type { Message } from '../types/message.js'
import type { StatusLineCommandInput } from '../types/statusLine.js'
import type { VimMode } from '../types/textInputTypes.js'
import { calculateContextPercentages, getContextWindowForModel } from '../utils/context.js'
import { getCwd } from '../utils/cwd.js'
import { createBaseHookInput } from '../utils/hooks.js'
import { getLastAssistantMessage } from '../utils/messages.js'
import { getRuntimeMainLoopModel, type ModelName, renderModelName } from '../utils/model/model.js'
import { getCurrentSessionTitle } from '../utils/sessionStorage.js'
import { doesMostRecentAssistantMessageExceed200k, getCurrentUsage } from '../utils/tokens.js'
import { getCurrentWorktreeSession } from '../utils/worktree.js'
import { isVimModeEnabled } from './PromptInput/utils.js'
import type { PermissionMode } from 'src/utils/permissions/PermissionMode.js'
import { getRawUtilization } from '../services/claudeAiLimits.js'

export function statusLineShouldDisplay(settings: ReadonlySettings): boolean {
  if (feature('KAIROS') && getKairosActive()) return false
  return settings?.statusLine !== undefined
}

export function buildStatusLineCommandInput(
  permissionMode: PermissionMode,
  exceeds200kTokens: boolean,
  settings: ReadonlySettings,
  messages: Message[],
  addedDirs: string[],
  mainLoopModel: ModelName,
  vimMode?: VimMode,
): StatusLineCommandInput {
  const agentType = getMainThreadAgentType()
  const worktreeSession = getCurrentWorktreeSession()
  const runtimeModel = getRuntimeMainLoopModel({
    permissionMode,
    mainLoopModel,
    exceeds200kTokens,
  })
  const outputStyleName = settings?.outputStyle || DEFAULT_OUTPUT_STYLE_NAME
  const currentUsage = getCurrentUsage(messages)
  const contextWindowSize = getContextWindowForModel(runtimeModel, getSdkBetas())
  const contextPercentages = calculateContextPercentages(
    currentUsage,
    contextWindowSize,
  )
  const sessionId = getSessionId()
  const sessionName = getCurrentSessionTitle(sessionId)
  const rawUtil = getRawUtilization()
  const rateLimits: StatusLineCommandInput['rate_limits'] = {
    ...(rawUtil.five_hour && {
      five_hour: {
        used_percentage: rawUtil.five_hour.utilization * 100,
        resets_at: rawUtil.five_hour.resets_at,
      },
    }),
    ...(rawUtil.seven_day && {
      seven_day: {
        used_percentage: rawUtil.seven_day.utilization * 100,
        resets_at: rawUtil.seven_day.resets_at,
      },
    }),
  }

  return {
    ...createBaseHookInput(),
    ...(sessionName && { session_name: sessionName }),
    model: {
      id: runtimeModel,
      display_name: renderModelName(runtimeModel),
    },
    workspace: {
      current_dir: getCwd(),
      project_dir: getOriginalCwd(),
      added_dirs: addedDirs,
    },
    version: MACRO.VERSION,
    output_style: {
      name: outputStyleName,
    },
    cost: {
      total_cost_usd: getTotalCost(),
      total_duration_ms: getTotalDuration(),
      total_api_duration_ms: getTotalAPIDuration(),
      total_lines_added: getTotalLinesAdded(),
      total_lines_removed: getTotalLinesRemoved(),
    },
    context_window: {
      total_input_tokens: getTotalInputTokens(),
      total_output_tokens: getTotalOutputTokens(),
      context_window_size: contextWindowSize,
      current_usage: currentUsage,
      used_percentage: contextPercentages.used,
      remaining_percentage: contextPercentages.remaining,
    },
    exceeds_200k_tokens: exceeds200kTokens,
    ...((rateLimits.five_hour || rateLimits.seven_day) && {
      rate_limits: rateLimits,
    }),
    ...(isVimModeEnabled() && {
      vim: {
        mode: vimMode ?? 'INSERT',
      },
    }),
    ...(agentType && {
      agent: {
        name: agentType,
      },
    }),
    ...(getIsRemoteMode() && {
      remote: {
        session_id: getSessionId(),
      },
    }),
    ...(worktreeSession && {
      worktree: {
        name: worktreeSession.worktreeName,
        path: worktreeSession.worktreePath,
        branch: worktreeSession.worktreeBranch,
        original_cwd: worktreeSession.originalCwd,
        original_branch: worktreeSession.originalBranch,
      },
    }),
  }
}

export function getLastAssistantMessageId(messages: Message[]): string | null {
  return getLastAssistantMessage(messages)?.uuid ?? null
}

export { doesMostRecentAssistantMessageExceed200k }
