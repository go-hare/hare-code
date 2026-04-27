import { describe, expect, test } from 'bun:test'

import { createRuntimePermissionService } from '../RuntimePermissionService.js'

describe('createRuntimePermissionService', () => {
  test('creates broker-backed tool contexts with runtime conversation and turn hooks', () => {
    const service = createRuntimePermissionService({
      runtimeId: 'runtime-1',
      getConversationId: () => 'conversation-1',
      getTurnId: () => 'turn-1',
    })

    const context = service.createToolUseContext()

    expect(context.permissionBroker).toBe(service.broker)
    expect(context.getConversationId?.()).toBe('conversation-1')
    expect(context.getTurnId?.()).toBe('turn-1')
  })

  test('lets hosts override conversation and turn ids per context', () => {
    const service = createRuntimePermissionService({
      runtimeId: 'runtime-1',
      getConversationId: () => 'conversation-1',
    })

    const context = service.createToolUseContext({
      getConversationId: () => 'conversation-2',
      getTurnId: () => 'turn-2',
    })

    expect(context.getConversationId?.()).toBe('conversation-2')
    expect(context.getTurnId?.()).toBe('turn-2')
  })
})
