import { describe, expect, test } from 'bun:test'
import { asAgentId } from '../../types/ids.js'

import {
  enqueuePendingNotification,
  getCommandsByMaxPriority,
  isSlashCommand,
  resetCommandQueue,
} from '../messageQueueManager.js'

describe('messageQueueManager.enqueuePendingNotification', () => {
  test('defaults main-thread task notifications to later priority', () => {
    resetCommandQueue()

    enqueuePendingNotification({
      mode: 'task-notification',
      value: 'main-thread notification',
    } as any)

    expect(getCommandsByMaxPriority('next')).toHaveLength(0)
    const queued = getCommandsByMaxPriority('later')
    expect(queued).toHaveLength(1)
    expect(queued[0]?.priority).toBe('later')
  })

  test('defaults agent-targeted task notifications to next priority', () => {
    resetCommandQueue()

    enqueuePendingNotification({
      mode: 'task-notification',
      value: 'child notification',
      agentId: asAgentId('parent-agent'),
    } as any)

    const queued = getCommandsByMaxPriority('next')
    expect(queued).toHaveLength(1)
    expect(queued[0]?.priority).toBe('next')
    expect(queued[0]?.agentId).toBe(asAgentId('parent-agent'))
  })
})

describe('messageQueueManager.isSlashCommand', () => {
  test('treats normal slash commands as slash commands', () => {
    expect(isSlashCommand({ value: '/help', mode: 'prompt' } as any)).toBe(true)
  })

  test('keeps remote bridge slash commands slash-routed when bridgeOrigin is set', () => {
    expect(
      isSlashCommand({
        value: '/proactive',
        mode: 'prompt',
        skipSlashCommands: true,
        bridgeOrigin: true,
      } as any),
    ).toBe(true)
  })

  test('keeps skipSlashCommands text-only when bridgeOrigin is absent', () => {
    expect(
      isSlashCommand({
        value: '/proactive',
        mode: 'prompt',
        skipSlashCommands: true,
      } as any),
    ).toBe(false)
  })
})
