import { describe, expect, test } from 'bun:test'
import type { ToolPermissionContext } from 'src/Tool.js'
import { getSpawnedAgentToolPermissionContext } from '../runAgent.js'

function makePermissionContext(
  overrides: Partial<ToolPermissionContext> = {},
): ToolPermissionContext {
  return {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: true,
    ...overrides,
  }
}

describe('getSpawnedAgentToolPermissionContext', () => {
  test('drops synthetic --tools deny rules while keeping explicit CLI denies', () => {
    const context = makePermissionContext({
      alwaysDenyRules: {
        cliArg: ['Read', 'Bash', 'ExplicitDanger'],
        session: ['Write'],
      },
      spawnedAgentCliArgDenyRules: ['ExplicitDanger'],
    })

    const result = getSpawnedAgentToolPermissionContext(context)

    expect(result.alwaysDenyRules.cliArg).toEqual(['ExplicitDanger'])
    expect(result.alwaysDenyRules.session).toEqual(['Write'])
    expect(context.alwaysDenyRules.cliArg).toEqual([
      'Read',
      'Bash',
      'ExplicitDanger',
    ])
  })

  test('leaves legacy permission contexts unchanged', () => {
    const context = makePermissionContext({
      alwaysDenyRules: { cliArg: ['Read'] },
    })

    expect(getSpawnedAgentToolPermissionContext(context)).toBe(context)
  })
})
