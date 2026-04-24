import { describe, expect, mock, test } from 'bun:test'

import { runReplBackgroundQueryController } from '../runReplBackgroundQueryController.js'

describe('runReplBackgroundQueryController', () => {
  test('aborts the foreground query and starts a background session', async () => {
    const abortForegroundQuery = mock(() => {})
    const removeTaskNotifications = mock(() => [])
    const prepareBackgroundQuery = mock(async ({ toolUseContext }) => ({
      toolUseContext,
      systemPrompt: ['system'],
      userContext: { user: 'ctx' },
      systemContext: { system: 'ctx' },
    })) as any
    const startBackgroundSession = mock(() => {})

    await runReplBackgroundQueryController({
      abortForegroundQuery,
      removeTaskNotifications,
      getCurrentMessages: () => [{ type: 'user', message: { content: 'hi' } }] as any,
      getToolUseContext: (_messages, _newMessages, abortController) =>
        ({ abortController } as any),
      mainLoopModel: 'sonnet',
      mainThreadAgentDefinition: undefined,
      prepareBackgroundQuery,
      getNotificationMessages: async () => [],
      canUseTool: (async () => ({ behavior: 'allow' })) as any,
      querySource: 'repl',
      description: 'terminal',
      setAppState: mock((_updater: unknown) => {}),
      startBackgroundSession,
    })

    expect(abortForegroundQuery).toHaveBeenCalledTimes(1)
    expect(removeTaskNotifications).toHaveBeenCalledTimes(1)
    expect(prepareBackgroundQuery).toHaveBeenCalledTimes(1)
    expect(startBackgroundSession).toHaveBeenCalledTimes(1)
    const firstCall = startBackgroundSession.mock.calls[0] as unknown as
      | [any]
      | undefined
    expect(firstCall?.[0]).toMatchObject({
      description: 'terminal',
      queryParams: {
        systemPrompt: ['system'],
        userContext: { user: 'ctx' },
        systemContext: { system: 'ctx' },
        querySource: 'repl',
      },
    })
  })

  test('deduplicates queued notification attachments already present in transcript', async () => {
    const existingNotification = {
      type: 'attachment',
      attachment: {
        type: 'queued_command',
        commandMode: 'task-notification',
        prompt: 'same prompt',
      },
    }
    const duplicateNotification = {
      type: 'attachment',
      attachment: {
        type: 'queued_command',
        commandMode: 'task-notification',
        prompt: 'same prompt',
      },
    }
    const freshNotification = {
      type: 'attachment',
      attachment: {
        type: 'queued_command',
        commandMode: 'task-notification',
        prompt: 'new prompt',
      },
    }
    const startBackgroundSession = mock(() => {})

    await runReplBackgroundQueryController({
      abortForegroundQuery: mock(() => {}),
      removeTaskNotifications: mock(() => [{ mode: 'task-notification' }] as any),
      getCurrentMessages: () => [existingNotification] as any,
      getToolUseContext: (_messages, _newMessages, abortController) =>
        ({ abortController } as any),
      mainLoopModel: 'sonnet',
      mainThreadAgentDefinition: undefined,
      prepareBackgroundQuery: (async ({ toolUseContext }: any) => ({
        toolUseContext,
        systemPrompt: ['system'],
        userContext: {},
        systemContext: {},
      })) as any,
      getNotificationMessages: async () =>
        [duplicateNotification, freshNotification] as any,
      canUseTool: (async () => ({ behavior: 'allow' })) as any,
      querySource: 'repl',
      description: 'terminal',
      setAppState: mock((_updater: unknown) => {}),
      startBackgroundSession,
    })

    expect(startBackgroundSession).toHaveBeenCalledTimes(1)
    const firstCall = startBackgroundSession.mock.calls[0] as unknown as
      | [any]
      | undefined
    expect(firstCall?.[0]?.messages).toEqual([
      existingNotification,
      freshNotification,
    ])
  })
})
