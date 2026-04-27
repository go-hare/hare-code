import { describe, expect, test } from 'bun:test'
import type { ToolUseContext, Tool } from '../../../Tool.js'
import type {
  PermissionAllowDecision,
  PermissionAskDecision,
} from '../../../types/permissions.js'
import { RuntimePermissionBroker } from '../../../runtime/capabilities/permissions/RuntimePermissionBroker.js'
import {
  createToolPermissionRuntimeContext,
  ensureToolPermissionRuntimeController,
} from '../../../utils/permissions/runtimePermissionBroker.js'
import { recordAcpRuntimePermissionDecision } from '../permissionRuntimeBroker.js'

const askDecision: PermissionAskDecision = {
  behavior: 'ask',
  message: 'Need approval',
}

function createTool(name: string): Tool {
  return {
    name,
    isReadOnly: () => false,
    isDestructive: () => false,
    isOpenWorld: () => false,
  } as unknown as Tool
}

function createContext(permissionBroker: RuntimePermissionBroker): ToolUseContext {
  return {
    options: {},
    getAppState: () => ({
      toolPermissionContext: {
        mode: 'default',
        isBypassPermissionsModeAvailable: true,
      },
    }),
    runtimePermission: createToolPermissionRuntimeContext({
      permissionBroker,
      getConversationId: () => 'conversation-1',
      getTurnId: () => 'turn-1',
    }),
  } as unknown as ToolUseContext
}

describe('recordAcpRuntimePermissionDecision', () => {
  test('resolves broker pending requests as allow_session for permanent ACP approvals', async () => {
    const broker = new RuntimePermissionBroker()
    const tool = createTool('Bash')
    const input = { command: 'pwd' }
    const context = createContext(broker)
    const controller = ensureToolPermissionRuntimeController({
      tool,
      input,
      toolUseContext: context,
      toolUseID: 'tool-use-1',
      permissionResult: askDecision,
    })
    const pending = controller?.start(askDecision)

    const decision: PermissionAllowDecision = {
      behavior: 'allow',
      updatedInput: input,
      toolUseID: 'tool-use-1',
      decisionReason: {
        type: 'permissionPromptTool',
        permissionPromptToolName: 'acp',
        toolResult: {
          behavior: 'allow',
          updatedInput: input,
          toolUseID: 'tool-use-1',
          decisionClassification: 'user_permanent',
        },
      },
    }

    recordAcpRuntimePermissionDecision({
      tool,
      input,
      context,
      toolUseID: 'tool-use-1',
      permissionResult: askDecision,
      decision,
    })

    await expect(pending).resolves.toMatchObject({
      behavior: 'allow',
      toolUseID: 'tool-use-1',
      decisionClassification: 'user_permanent',
    })
    expect(broker.snapshot()).toMatchObject({
      pendingRequestIds: [],
      finalizedRequestIds: ['tool-use-1'],
      sessionGrantCount: 1,
    })
  })
})
