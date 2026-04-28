import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = join(import.meta.dir, '../../../../..')

const executionStateTargets = [
  'src/query.ts',
  'src/query/config.ts',
  'src/services/api/claude.ts',
  'src/services/api/logging.ts',
  'src/services/compact/autoCompact.ts',
  'src/services/compact/compact.ts',
  'src/commands/compact/compact.ts',
  'src/utils/processUserInput/processSlashCommand.tsx',
  'src/utils/processUserInput/processTextPrompt.ts',
  'src/utils/processUserInput/processUserInput.ts',
] as const

function readSource(file: string): string {
  return readFileSync(join(repoRoot, file), 'utf8')
}

describe('execution bootstrap import discipline', () => {
  for (const file of executionStateTargets) {
    test(`${file} does not import bootstrap state directly`, () => {
      const content = readSource(file)
      expect(content).not.toContain("from 'src/bootstrap/state.js'")
      expect(content).not.toContain("from './bootstrap/state.js'")
      expect(content).not.toContain("from '../bootstrap/state.js'")
      expect(content).not.toContain("from '../../bootstrap/state.js'")
    })
  }

  test('query chain reads session and budget state through runtime providers', () => {
    const queryContent = readSource('src/query.ts')
    const configContent = readSource('src/query/config.ts')

    expect(queryContent).toContain(
      'createRuntimeSessionIdentityStateProvider',
    )
    expect(queryContent).toContain('createRuntimeUsageStateProvider')
    expect(queryContent).toContain('getExecutionBudget()')
    expect(queryContent).toContain('incrementBudgetContinuationCount()')
    expect(configContent).toContain(
      'createRuntimeSessionIdentityStateProvider',
    )
  })

  test('input chain reads prompt and skill state through runtime providers', () => {
    const slashCommandContent = readSource(
      'src/utils/processUserInput/processSlashCommand.tsx',
    )
    const textPromptContent = readSource(
      'src/utils/processUserInput/processTextPrompt.ts',
    )

    expect(slashCommandContent).toContain(
      'createRuntimeSessionIdentityStateProvider',
    )
    expect(slashCommandContent).toContain(
      'createRuntimeRequestDebugStateProvider',
    )
    expect(slashCommandContent).toContain(
      'createRuntimeInvokedSkillStateProvider',
    )
    expect(slashCommandContent).toContain('patchRequestDebugState({ promptId })')
    expect(slashCommandContent).toContain('.addInvokedSkill(')
    expect(textPromptContent).toContain(
      'createRuntimeRequestDebugStateProvider',
    )
    expect(textPromptContent).toContain('patchRequestDebugState({ promptId })')
  })
})
