import { describe, expect, test } from 'bun:test'

import { getEmptyToolPermissionContext } from '../../../../../Tool.js'
import type { Tool, ToolUseContext } from '../../../../../Tool.js'
import type { CanUseToolFn } from '../../../../../hooks/useCanUseTool.js'
import type { AssistantMessage } from '../../../../../types/message.js'
import type { KernelRuntimeEnvelopeBase } from '../../../../contracts/events.js'
import { createHeadlessPermissionRuntime } from '../headlessPermissionRuntime.js'

function createTool(): Tool {
  return {
    name: 'Read',
    isReadOnly: () => true,
    isDestructive: () => false,
  } as unknown as Tool
}

function createContext(): ToolUseContext {
  return {
    getAppState: () => ({
      toolPermissionContext: getEmptyToolPermissionContext(),
    }),
  } as unknown as ToolUseContext
}

function createAssistantMessage(): AssistantMessage {
  return {} as AssistantMessage
}

function getPayloadType(envelope: KernelRuntimeEnvelopeBase): unknown {
  if (!envelope.payload || typeof envelope.payload !== 'object') {
    return undefined
  }
  return (envelope.payload as Record<string, unknown>).type
}

describe('createHeadlessPermissionRuntime', () => {
  test('observes permission audit envelopes without changing legacy decisions', async () => {
    const observed: KernelRuntimeEnvelopeBase[] = []
    const legacyDecision = {
      behavior: 'allow' as const,
      decisionReason: {
        type: 'mode' as const,
        mode: 'default' as const,
      },
    }
    const canUseTool: CanUseToolFn = async () => legacyDecision
    const runtime = createHeadlessPermissionRuntime({
      runtimeId: 'runtime-1',
      getConversationId: () => 'conversation-1',
      canUseTool,
      runtimeEventSink: envelope => {
        observed.push(envelope)
      },
    })

    await expect(
      runtime.canUseTool(
        createTool(),
        { file_path: '/tmp/file.txt' },
        createContext(),
        createAssistantMessage(),
        'tool-use-1',
      ),
    ).resolves.toBe(legacyDecision)

    expect(observed).toHaveLength(2)
    expect(observed.map(envelope => envelope.kind)).toEqual(['event', 'event'])
    expect(observed.map(getPayloadType)).toEqual([
      'permission.requested',
      'permission.resolved',
    ])
    expect(observed.map(envelope => envelope.conversationId)).toEqual([
      'conversation-1',
      'conversation-1',
    ])

    runtime.dispose()
  })
})
