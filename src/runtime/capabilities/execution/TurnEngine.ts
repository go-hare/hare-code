import type { QueryParams } from '../../../query.js'
import type { Terminal } from '../../../query/transitions.js'
import type {
  Message,
  RequestStartEvent,
  StreamEvent,
  TombstoneMessage,
  ToolUseSummaryMessage,
} from '../../../types/message.js'
import { getSessionId } from '../../../bootstrap/state.js'
import { createTrace, endTrace, isLangfuseEnabled } from '../../../services/langfuse/index.js'
import { logForDebugging } from '../../../utils/debug.js'
import { getAPIProvider } from '../../../utils/model/providers.js'

export type LegacyTurnStreamItem =
  | StreamEvent
  | RequestStartEvent
  | Message
  | TombstoneMessage
  | ToolUseSummaryMessage

export type LegacyTurnLoopRunner = (
  params: QueryParams,
  consumedCommandUuids: string[],
) => AsyncGenerator<LegacyTurnStreamItem, Terminal>

export type TurnEngineOptions = {
  runLoop: LegacyTurnLoopRunner
  onCommandCompleted?: (uuid: string) => void
}

/**
 * Runtime-owned wrapper for the existing query turn orchestration.
 * The underlying loop stays in query.ts; this capability owns the entry seam.
 */
export class TurnEngine {
  constructor(private readonly options: TurnEngineOptions) {}

  async *execute(
    params: QueryParams,
  ): AsyncGenerator<LegacyTurnStreamItem, Terminal> {
    const consumedCommandUuids: string[] = []

    // Create Langfuse trace for this query turn (no-op if not configured).
    // When called as a sub-agent, langfuseTrace is already set by runAgent()
    // and should be reused instead of creating an independent trace.
    const ownsTrace = !params.toolUseContext.langfuseTrace
    logForDebugging(
      `[query] ownsTrace=${ownsTrace} incoming langfuseTrace=${params.toolUseContext.langfuseTrace ? 'present' : 'null/undefined'} isLangfuseEnabled=${isLangfuseEnabled()}`,
    )
    const langfuseTrace = params.toolUseContext.langfuseTrace
      ?? (isLangfuseEnabled()
        ? createTrace({
            sessionId: getSessionId(),
            model: params.toolUseContext.options.mainLoopModel,
            provider: getAPIProvider(),
            input: params.messages,
            querySource: params.querySource,
          })
        : null)

    const paramsWithTrace: QueryParams = langfuseTrace
      ? {
          ...params,
          toolUseContext: { ...params.toolUseContext, langfuseTrace },
        }
      : params

    let terminal: Terminal | undefined
    try {
      terminal = yield* this.options.runLoop(paramsWithTrace, consumedCommandUuids)
    } finally {
      if (ownsTrace) {
        const isAborted =
          terminal?.reason === 'aborted_streaming' ||
          terminal?.reason === 'aborted_tools'
        endTrace(langfuseTrace, undefined, isAborted ? 'interrupted' : undefined)
      }
    }

    for (const uuid of consumedCommandUuids) {
      this.options.onCommandCompleted?.(uuid)
    }

    // biome-ignore lint/style/noNonNullAssertion: terminal is always assigned when runLoop returns normally
    return terminal!
  }
}

export function createTurnEngine(options: TurnEngineOptions): TurnEngine {
  return new TurnEngine(options)
}
