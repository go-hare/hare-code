import { describe, expect, test } from 'bun:test'
import { z } from 'zod/v4'
import { RuntimePermissionBroker } from '../../../runtime/capabilities/permissions/RuntimePermissionBroker.js'
import type { Tool, ToolUseContext } from '../../../Tool.js'
import { getEmptyToolPermissionContext } from '../../../Tool.js'
import {
  createToolPermissionRuntimeContext,
  ensureToolPermissionRuntimeController,
} from '../../../utils/permissions/runtimePermissionBroker.js'

function createTool(): Tool {
  return {
    name: 'TestTool',
    inputSchema: z.object({ path: z.string() }),
    async call() {
      return { data: 'ok' }
    },
    async description() {
      return 'test tool'
    },
    isConcurrencySafe() {
      return true
    },
    isEnabled() {
      return true
    },
    isReadOnly() {
      return false
    },
    async checkPermissions() {
      return { behavior: 'ask', message: 'confirm' }
    },
    async prompt() {
      return 'prompt'
    },
    userFacingName() {
      return 'Test'
    },
    maxResultSizeChars: 1024,
    toAutoClassifierInput() {
      return ''
    },
    mapToolResultToToolResultBlockParam() {
      return {
        type: 'tool_result',
        tool_use_id: 'tool-1',
        content: 'ok',
      }
    },
    renderToolUseMessage() {
      return null
    },
  } as unknown as Tool
}

function createToolUseContext(): ToolUseContext {
  const state = {
    toolPermissionContext: getEmptyToolPermissionContext(),
  }
  return {
    options: {
      commands: [],
      debug: false,
      mainLoopModel: 'test-model',
      tools: [],
      verbose: false,
      thinkingConfig: { type: 'disabled' },
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: false,
      agentDefinitions: {
        activeAgents: [],
        allAgents: [],
      },
    },
    abortController: new AbortController(),
    readFileState: {} as ToolUseContext['readFileState'],
    getAppState() {
      return state as ReturnType<ToolUseContext['getAppState']>
    },
    setAppState() {},
    setInProgressToolUseIDs() {},
    setResponseLength() {},
    updateFileHistoryState() {},
    updateAttributionState() {},
    messages: [],
  }
}

describe('createToolPermissionRuntimeController', () => {
  test('records bridge allow decisions through the runtime broker', async () => {
    const broker = new RuntimePermissionBroker()
    const controller = ensureToolPermissionRuntimeController({
      tool: createTool(),
      input: { path: 'before.txt' },
      toolUseContext: createToolUseContext(),
      toolUseID: 'tool-1',
      runtimePermission: createToolPermissionRuntimeContext({
        permissionBroker: broker,
        getConversationId: () => 'conversation-1',
      }),
    })!

    const brokerDecision = controller.start({
      behavior: 'ask',
      message: 'confirm',
    })!

    expect(broker.snapshot().pendingRequestIds).toEqual(['tool-1'])

    controller.decide(
      {
        behavior: 'allow',
        updatedInput: { path: 'after.txt' },
        decisionReason: {
          type: 'permissionPromptTool',
          permissionPromptToolName: 'bridge',
          toolResult: {
            behavior: 'allow',
            updatedInput: { path: 'after.txt' },
            toolUseID: 'tool-1',
            decisionClassification: 'user_permanent',
          },
        },
      },
      'repl_bridge_remote',
    )

    const decision = await brokerDecision
    expect(decision).toMatchObject({
      behavior: 'allow',
      updatedInput: { path: 'after.txt' },
      decisionReason: {
        type: 'permissionPromptTool',
        permissionPromptToolName: 'runtime-permission-broker',
        toolResult: {
          behavior: 'allow',
          toolUseID: 'tool-1',
          decisionClassification: 'user_permanent',
        },
      },
    })
    expect(broker.snapshot().pendingRequestIds).toEqual([])
    expect(broker.snapshot().finalizedRequestIds).toEqual(['tool-1'])
  })

  test('records bridge deny decisions through the runtime broker', async () => {
    const broker = new RuntimePermissionBroker()
    const controller = ensureToolPermissionRuntimeController({
      tool: createTool(),
      input: { path: 'blocked.txt' },
      toolUseContext: createToolUseContext(),
      toolUseID: 'tool-2',
      runtimePermission: createToolPermissionRuntimeContext({
        permissionBroker: broker,
        getConversationId: () => 'conversation-1',
      }),
    })!

    const brokerDecision = controller.start({
      behavior: 'ask',
      message: 'confirm',
    })!

    controller.decide(
      {
        behavior: 'deny',
        message: 'Denied remotely',
        decisionReason: {
          type: 'permissionPromptTool',
          permissionPromptToolName: 'bridge',
          toolResult: {
            behavior: 'deny',
            message: 'Denied remotely',
            toolUseID: 'tool-2',
            decisionClassification: 'user_reject',
          },
        },
      },
      'repl_bridge_remote',
    )

    await expect(brokerDecision).resolves.toMatchObject({
      behavior: 'deny',
      message: 'Denied remotely',
      decisionReason: {
        type: 'permissionPromptTool',
        permissionPromptToolName: 'runtime-permission-broker',
        toolResult: {
          behavior: 'deny',
          toolUseID: 'tool-2',
          decisionClassification: 'user_reject',
        },
      },
    })
  })
})
