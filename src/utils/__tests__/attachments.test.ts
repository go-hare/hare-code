import { afterEach, describe, expect, test } from 'bun:test'
import {
  getActiveTaskCompletionReminderAttachment,
  getQueuedCommandAttachmentBatch,
  getVerifyPlanReminderAttachment,
} from '../attachments.js'
import { createTask } from '../tasks.js'

const originalVerifyPlan = process.env.CLAUDE_CODE_VERIFY_PLAN

afterEach(() => {
  if (originalVerifyPlan === undefined) {
    delete process.env.CLAUDE_CODE_VERIFY_PLAN
  } else {
    process.env.CLAUDE_CODE_VERIFY_PLAN = originalVerifyPlan
  }
})

describe('getQueuedCommandAttachmentBatch', () => {
  test('keeps successful queued commands when one attachment build fails', async () => {
    const result = await getQueuedCommandAttachmentBatch([
      {
        uuid: '11111111-1111-1111-1111-111111111111' as any,
        mode: 'prompt',
        value: 'delivered prompt',
      },
      {
        uuid: '22222222-2222-2222-2222-222222222222' as any,
        mode: 'prompt',
        value: 'broken image prompt',
        pastedContents: {
          1: {
            id: 1,
            type: 'image',
            content: 'a'.repeat(8_000_000),
            mediaType: 'image/png',
          } as any,
        },
      },
    ])

    expect(result.attachments).toHaveLength(1)
    expect(result.attachments[0]).toMatchObject({
      type: 'queued_command',
      source_uuid: '11111111-1111-1111-1111-111111111111',
    })
    expect(result.attachedQueuedCommands.map(cmd => cmd.uuid)).toEqual([
      '11111111-1111-1111-1111-111111111111',
    ])
  })
})

describe('getVerifyPlanReminderAttachment', () => {
  const reminderMessages = [
    {
      type: 'attachment',
      attachment: { type: 'plan_mode_exit' },
    },
    ...Array.from({ length: 10 }, (_, index) => ({
      type: 'user',
      uuid: `user-${index}`,
      message: { role: 'user', content: `turn ${index}` },
    })),
  ] as any

  test('keeps reminding while background verification is pending', async () => {
    process.env.CLAUDE_CODE_VERIFY_PLAN = 'true'

    const attachments = await getVerifyPlanReminderAttachment(
      reminderMessages,
      {
        getAppState: () => ({
          pendingPlanVerification: {
            plan: 'Ship the feature',
            verificationStarted: true,
            verificationCompleted: false,
          },
        }),
      } as any,
    )

    expect(attachments).toEqual([
      { type: 'verify_plan_reminder', verificationStarted: true },
    ])
  })

  test('does not remind after verification completes', async () => {
    process.env.CLAUDE_CODE_VERIFY_PLAN = 'true'

    const attachments = await getVerifyPlanReminderAttachment(
      reminderMessages,
      {
        getAppState: () => ({
          pendingPlanVerification: {
            plan: 'Ship the feature',
            verificationStarted: true,
            verificationCompleted: true,
          },
        }),
      } as any,
    )

    expect(attachments).toEqual([])
  })
})

describe('getActiveTaskCompletionReminderAttachment', () => {
  test('reminds when a foreground task has follow-up tool activity after activation', async () => {
    const taskListId = `active-task-reminder-${Date.now()}`
    const taskId = await createTask(taskListId, {
      subject: 'Review bug fixes',
      description: 'Inspect the diff and decide whether the fixes are done',
      status: 'in_progress',
      owner: undefined,
      blocks: [],
      blockedBy: [],
    })

    const attachments = await getActiveTaskCompletionReminderAttachment(
      [
        {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'task-update',
                name: 'TaskUpdate',
                input: { taskId, status: 'in_progress' },
              },
            ],
          },
        },
        {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'bash-review',
                name: 'Bash',
                input: { command: 'git diff -- src/runtime/core/state.ts' },
              },
            ],
          },
        },
      ] as any,
      {
        agentId: undefined,
        activeTaskExecutionContext: { taskListId, taskId },
        options: { tools: [{ name: 'TaskUpdate' }] },
      } as any,
    )

    expect(attachments).toEqual([
      {
        type: 'active_task_completion_reminder',
        taskId,
        subject: 'Review bug fixes',
      },
    ])
  })

  test('does not remind before any follow-up work happens', async () => {
    const taskListId = `active-task-no-reminder-${Date.now()}`
    const taskId = await createTask(taskListId, {
      subject: 'Review bug fixes',
      description: 'Inspect the diff and decide whether the fixes are done',
      status: 'in_progress',
      owner: undefined,
      blocks: [],
      blockedBy: [],
    })

    const attachments = await getActiveTaskCompletionReminderAttachment(
      [
        {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'task-update',
                name: 'TaskUpdate',
                input: { taskId, status: 'in_progress' },
              },
            ],
          },
        },
      ] as any,
      {
        agentId: undefined,
        activeTaskExecutionContext: { taskListId, taskId },
        options: { tools: [{ name: 'TaskUpdate' }] },
      } as any,
    )

    expect(attachments).toEqual([])
  })
})
