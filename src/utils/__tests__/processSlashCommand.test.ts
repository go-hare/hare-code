import { beforeEach, describe, expect, test } from 'bun:test'
import type { Command } from 'src/commands.js'
import type { ToolUseContext } from 'src/Tool.js'
import {
  getInvokedSkillsForAgent,
  resetStateForTests,
  switchSession,
} from '../../bootstrap/state.js'
import { getDefaultAppState } from '../../state/AppStateStore.js'
import { asSessionId } from '../../types/ids.js'
import { createFileStateCacheWithSizeLimit } from '../fileStateCache.js'
import { getSessionHooks } from '../hooks/sessionHooks.js'
import { processPromptSlashCommand } from '../processUserInput/processSlashCommand.js'

function createSlashCommandContext(): {
  appState: ReturnType<typeof getDefaultAppState>
  context: ToolUseContext
} {
  let appState = getDefaultAppState()

  return {
    get appState() {
      return appState
    },
    context: {
      abortController: new AbortController(),
      options: {
        commands: [],
        debug: false,
        mainLoopModel: 'sonnet',
        tools: [],
        verbose: false,
        thinkingConfig: { type: 'disabled' },
        mcpClients: [],
        mcpResources: {},
        isNonInteractiveSession: true,
        agentDefinitions: {
          activeAgents: [],
          allAgents: [],
          allowedAgentTypes: undefined,
        } as never,
      },
      readFileState: createFileStateCacheWithSizeLimit(10),
      getAppState: () => appState,
      setAppState: updater => {
        appState = updater(appState)
      },
      messages: [],
      setInProgressToolUseIDs: () => {},
      setResponseLength: () => {},
      updateFileHistoryState: () => {},
      updateAttributionState: () => {},
    } as ToolUseContext,
  }
}

describe('processPromptSlashCommand', () => {
  beforeEach(() => {
    resetStateForTests()
    switchSession(asSessionId('session-skill-test'))
  })

  test('registers hooks and invoked skills through runtime state seams', async () => {
    const { appState, context } = createSlashCommandContext()
    const command = {
      name: 'demo-skill',
      type: 'prompt',
      source: 'builtin',
      skillRoot: '/skills/demo-skill',
      allowedTools: [],
      hooks: {
        PreToolUse: [
          {
            matcher: 'Write',
            hooks: [{ type: 'command', command: 'echo hooked' }],
          },
        ],
      },
      getPromptForCommand: async () => [
        { type: 'text', text: 'Skill prompt body' },
      ],
    } as unknown as Command

    const result = await processPromptSlashCommand(
      'demo-skill',
      '',
      [command],
      context,
    )

    expect(result.shouldQuery).toBe(true)

    const invokedSkills = [...getInvokedSkillsForAgent(null).values()]
    expect(invokedSkills).toHaveLength(1)
    expect(invokedSkills[0]).toMatchObject({
      skillName: 'demo-skill',
      skillPath: 'builtin:demo-skill',
      content: 'Skill prompt body',
      agentId: null,
    })

    expect(
      getSessionHooks(appState, 'session-skill-test', 'PreToolUse').get(
        'PreToolUse',
      ),
    ).toEqual([
      {
        matcher: 'Write',
        hooks: [{ type: 'command', command: 'echo hooked' }],
        skillRoot: '/skills/demo-skill',
      },
    ])
  })
})
