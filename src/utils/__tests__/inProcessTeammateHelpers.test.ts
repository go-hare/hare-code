import { describe, expect, test } from 'bun:test'
import type { Tools } from '../../Tool.js'
import {
  applyOutOfProcessTeammateIdleSnapshot,
  deriveTeammateProgress,
} from '../inProcessTeammateHelpers.js'

function makeAssistantMessage(overrides?: Record<string, unknown>) {
  return {
    uuid: 'assistant-1',
    type: 'assistant',
    timestamp: new Date().toISOString(),
    message: {
      usage: {
        input_tokens: 10,
        output_tokens: 4,
        cache_read_input_tokens: 1,
        cache_creation_input_tokens: 2,
      },
      content: [
        {
          type: 'tool_use',
          id: 'tool-1',
          name: 'Read',
          input: { file_path: 'src/demo.ts' },
        },
      ],
    },
    ...overrides,
  } as const
}

function makePaneTask(overrides?: Record<string, unknown>) {
  return {
    id: 't-pane',
    type: 'in_process_teammate',
    status: 'running',
    description: 'pane teammate',
    startTime: 0,
    outputFile: '',
    outputOffset: 0,
    notified: false,
    identity: {
      agentId: 'reviewer@alpha',
      agentName: 'reviewer',
      teamName: 'alpha',
      planModeRequired: false,
      parentSessionId: 'leader-session',
    },
    prompt: 'review the diff',
    executionBackend: 'tmux',
    awaitingPlanApproval: false,
    permissionMode: 'default',
    isIdle: false,
    shutdownRequested: false,
    lastReportedToolCount: 0,
    lastReportedTokenCount: 0,
    pendingUserMessages: [],
    messages: [],
    ...overrides,
  } as const
}

describe('inProcessTeammateHelpers', () => {
  test('deriveTeammateProgress builds tool and token counts from assistant transcript messages', () => {
    const progress = deriveTeammateProgress(
      [makeAssistantMessage() as never],
      [] as Tools,
    )

    expect(progress).toMatchObject({
      toolUseCount: 1,
      tokenCount: 17,
    })
  })

  test('applyOutOfProcessTeammateIdleSnapshot marks pane teammates idle and backfills progress', () => {
    let state: { tasks: Record<string, unknown> } = {
      tasks: {
        't-pane': makePaneTask({
          messages: [
            {
              uuid: 'user-1',
              type: 'user',
              timestamp: new Date().toISOString(),
              message: { content: 'please continue' },
            },
          ],
        }),
      },
    }

    applyOutOfProcessTeammateIdleSnapshot(
      't-pane',
      [makeAssistantMessage() as never],
      updater => {
        state = updater(state as never) as unknown as typeof state
      },
      [] as Tools,
    )

    expect(state.tasks['t-pane']).toMatchObject({
      isIdle: true,
      lastReportedToolCount: 1,
      lastReportedTokenCount: 17,
      progress: {
        toolUseCount: 1,
        tokenCount: 17,
      },
    })
    expect((state.tasks['t-pane'] as { messages?: unknown[] })?.messages).toHaveLength(2)
  })
})
