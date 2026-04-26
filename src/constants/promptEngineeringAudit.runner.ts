import { beforeEach, describe, expect, mock, test } from 'bun:test'

;(globalThis as any).MACRO = {
  VERSION: '2.1.888',
  BUILD_TIME: '2026-04-22T00:00:00Z',
  FEEDBACK_CHANNEL: '',
  ISSUES_EXPLAINER: 'report issues on GitHub',
  NATIVE_PACKAGE_URL: '',
  PACKAGE_URL: '',
  VERSION_CHANGELOG: '',
}

mock.module('src/bootstrap/state.js', () => ({
  getIsNonInteractiveSession: () => false,
  sessionId: 'test-session',
  getCwd: () => '/test/project',
}))
mock.module('src/utils/cwd.js', () => ({
  getCwd: () => '/test/project',
}))
mock.module('src/utils/git.js', () => ({
  getIsGit: async () => true,
}))
mock.module('src/utils/worktree.js', () => ({
  getCurrentWorktreeSession: () => null,
}))
mock.module('src/constants/common.js', () => ({
  getSessionStartDate: () => '2026-04-22',
}))
mock.module('src/utils/settings/settings.js', () => ({
  getInitialSettings: () => ({ language: undefined }),
}))
mock.module('src/commands/poor/poorMode.js', () => ({
  isPoorModeActive: () => false,
}))
mock.module('src/utils/env.js', () => ({
  env: { platform: 'linux' },
}))
mock.module('src/utils/envUtils.js', () => ({
  isEnvTruthy: () => false,
}))
mock.module('src/utils/model/model.js', () => ({
  getCanonicalName: (id: string) => id,
  getMarketingNameForModel: (id: string) => {
    if (id.includes('opus-4-7')) return 'Claude Opus 4.7'
    if (id.includes('opus-4-6')) return 'Claude Opus 4.6'
    if (id.includes('sonnet-4-6')) return 'Claude Sonnet 4.6'
    return null
  },
}))
mock.module('src/commands.js', () => ({
  getSkillToolCommands: async () => [],
}))
mock.module('src/constants/outputStyles.js', () => ({
  getOutputStyleConfig: async () => null,
}))
mock.module('src/utils/embeddedTools.js', () => ({
  hasEmbeddedSearchTools: () => false,
}))
mock.module('src/utils/permissions/filesystem.js', () => ({
  isScratchpadEnabled: () => false,
  getScratchpadDir: () => '/tmp/scratchpad',
}))
mock.module('src/utils/betas.js', () => ({
  shouldUseGlobalCacheScope: () => false,
}))
mock.module('src/utils/undercover.js', () => ({
  isUndercover: () => false,
}))
mock.module('src/utils/model/antModels.js', () => ({
  getAntModelOverrideConfig: () => null,
}))
mock.module('src/utils/mcpInstructionsDelta.js', () => ({
  isMcpInstructionsDeltaEnabled: () => false,
}))
mock.module('src/memdir/memdir.js', () => ({
  loadMemoryPrompt: async () => null,
}))
mock.module('src/utils/debug.js', () => ({
  logForDebugging: () => {},
}))
mock.module('src/services/analytics/growthbook.js', () => ({
  getFeatureValue_CACHED_MAY_BE_STALE: () => false,
}))
mock.module('bun:bundle', () => ({
  feature: (_name: string) => false,
}))
mock.module('src/constants/systemPromptSections.js', () => ({
  systemPromptSection: (_name: string, fn: () => any) => fn(),
  DANGEROUS_uncachedSystemPromptSection: (_name: string, fn: () => any) =>
    fn(),
  resolveSystemPromptSections: async (sections: any[]) =>
    sections.filter(s => s !== null),
}))

const TOOL_NAMES = {
  Bash: 'Bash',
  Read: 'Read',
  Edit: 'Edit',
  Write: 'Write',
  Glob: 'Glob',
  Grep: 'Grep',
  Agent: 'Agent',
  AskUserQuestion: 'AskUserQuestion',
  TaskCreate: 'TaskCreate',
  DiscoverSkills: 'DiscoverSkills',
  Skill: 'Skill',
  Sleep: 'Sleep',
}

mock.module('@go-hare/builtin-tools/tools/BashTool/toolName.js', () => ({
  BASH_TOOL_NAME: TOOL_NAMES.Bash,
}))
mock.module('@go-hare/builtin-tools/tools/FileReadTool/prompt.js', () => ({
  FILE_READ_TOOL_NAME: TOOL_NAMES.Read,
}))
mock.module('@go-hare/builtin-tools/tools/FileEditTool/constants.js', () => ({
  FILE_EDIT_TOOL_NAME: TOOL_NAMES.Edit,
}))
mock.module('@go-hare/builtin-tools/tools/FileWriteTool/prompt.js', () => ({
  FILE_WRITE_TOOL_NAME: TOOL_NAMES.Write,
}))
mock.module('@go-hare/builtin-tools/tools/GlobTool/prompt.js', () => ({
  GLOB_TOOL_NAME: TOOL_NAMES.Glob,
}))
mock.module('@go-hare/builtin-tools/tools/GrepTool/prompt.js', () => ({
  GREP_TOOL_NAME: TOOL_NAMES.Grep,
}))
mock.module('@go-hare/builtin-tools/tools/AgentTool/constants.js', () => ({
  AGENT_TOOL_NAME: TOOL_NAMES.Agent,
  VERIFICATION_AGENT_TYPE: 'verification',
}))
mock.module('@go-hare/builtin-tools/tools/AgentTool/forkSubagent.js', () => ({
  isForkSubagentEnabled: () => false,
}))
mock.module('@go-hare/builtin-tools/tools/AgentTool/builtInAgents.js', () => ({
  areExplorePlanAgentsEnabled: () => false,
}))
mock.module(
  '@go-hare/builtin-tools/tools/AgentTool/built-in/exploreAgent.js',
  () => ({
    EXPLORE_AGENT: { agentType: 'explore' },
    EXPLORE_AGENT_MIN_QUERIES: 5,
  }),
)
mock.module('@go-hare/builtin-tools/tools/AskUserQuestionTool/prompt.js', () => ({
  ASK_USER_QUESTION_TOOL_NAME: TOOL_NAMES.AskUserQuestion,
}))
mock.module('@go-hare/builtin-tools/tools/TodoWriteTool/constants.js', () => ({
  TODO_WRITE_TOOL_NAME: 'TodoWrite',
}))
mock.module('@go-hare/builtin-tools/tools/TaskCreateTool/constants.js', () => ({
  TASK_CREATE_TOOL_NAME: TOOL_NAMES.TaskCreate,
}))
mock.module('@go-hare/builtin-tools/tools/DiscoverSkillsTool/prompt.js', () => ({
  DISCOVER_SKILLS_TOOL_NAME: TOOL_NAMES.DiscoverSkills,
}))
mock.module('@go-hare/builtin-tools/tools/SkillTool/constants.js', () => ({
  SKILL_TOOL_NAME: TOOL_NAMES.Skill,
}))
mock.module('@go-hare/builtin-tools/tools/SleepTool/prompt.js', () => ({
  SLEEP_TOOL_NAME: TOOL_NAMES.Sleep,
}))
mock.module('@go-hare/builtin-tools/tools/REPLTool/constants.js', () => ({
  isReplModeEnabled: () => false,
}))

import {
  computeSimpleEnvInfo,
  getSystemPrompt,
  prependBullets,
} from './prompts.js'
import type { Tools } from '../Tool.js'

const standardTools: Tools = [
  { name: 'Bash' },
  { name: 'Read' },
  { name: 'Edit' },
  { name: 'Write' },
  { name: 'Glob' },
  { name: 'Grep' },
  { name: 'Agent' },
  { name: 'AskUserQuestion' },
  { name: 'TaskCreate' },
] as any

async function getFullPrompt(
  tools: Tools = standardTools,
  model = 'claude-opus-4-7',
): Promise<string> {
  const sections = await getSystemPrompt(tools, model)
  return sections.join('\n\n')
}

beforeEach(() => {
  delete process.env.USER_TYPE
})

describe('Opus 4.7 Prompt Engineering Audit', () => {
  test('restores Opus 4.7 model identity and cutoff', async () => {
    const envInfo = await computeSimpleEnvInfo('claude-opus-4-7')
    expect(envInfo).toContain('Claude 4.5/4.6/4.7')
    expect(envInfo).toContain('claude-opus-4-7')
    expect(envInfo).toContain('January 2026')
    expect(envInfo).toContain('Claude Opus 4.7')
  })

  test('keeps tool discovery and prompt-injection boundaries visible to all users', async () => {
    const prompt = await getFullPrompt()
    expect(prompt).toContain('visible tool list is partial by design')
    expect(prompt).toContain('Only state something is unavailable')
    expect(prompt).toContain('not from the user')
  })

  test('includes Opus 4.7 tool-selection decision tree and examples', async () => {
    const prompt = await getFullPrompt()
    expect(prompt).toContain('Step 0')
    expect(prompt).toContain('stop at the first match')
    expect(prompt).toContain('Tool selection examples')
    expect(prompt).toContain('Glob("**/*.tsx")')
    expect(prompt).toContain('not Bash sed')
  })

  test('includes query construction, fallback, and search-before-unknown guidance', async () => {
    const prompt = await getFullPrompt()
    expect(prompt).toContain('query construction')
    expect(prompt).toContain('authenticate|login|signIn')
    expect(prompt).toContain('fallback chain')
    expect(prompt).toContain('Search first, report results second')
  })

  test('ungates completion honesty and constructive collaboration guidance', async () => {
    const prompt = await getFullPrompt()
    expect(prompt).toContain('Report outcomes faithfully')
    expect(prompt).toContain('Default to helping')
    expect(prompt).toContain('maintain self-respect')
    expect(prompt).toContain('constructively')
  })

  test('restores communication guidance for external users', async () => {
    const prompt = await getFullPrompt()
    expect(prompt).toContain("Don't narrate internal machinery")
    expect(prompt).toContain('the user can read the diff')
    expect(prompt).toContain('one question per response')
    expect(prompt).toContain('the user will ask if they need more')
  })

  test('product info includes adjacent Claude Code surfaces', async () => {
    const envInfo = await computeSimpleEnvInfo('claude-opus-4-7')
    expect(envInfo).toContain('Chrome')
    expect(envInfo).toContain('Excel')
    expect(envInfo).toContain('Cowork')
  })

  test('prependBullets behavior remains stable', () => {
    expect(prependBullets(['A', ['sub1', 'sub2'], 'B'])).toEqual([
      ' - A',
      '  - sub1',
      '  - sub2',
      ' - B',
    ])
  })
})
