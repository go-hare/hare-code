import { afterEach, describe, expect, test } from 'bun:test'
import {
  getQueuedCommandAttachmentBatch,
  getVerifyPlanReminderAttachment,
} from '../attachments.js'

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
