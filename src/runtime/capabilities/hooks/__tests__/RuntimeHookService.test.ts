import { describe, expect, mock, test } from 'bun:test'
import type { LoadedPlugin, PluginError } from '../../../../types/plugin.js'
import {
  countRuntimePluginHooks,
  createRuntimeHookService,
  type RuntimeHookServiceDeps,
} from '../RuntimeHookService.js'

function createDeps(
  overrides: Partial<RuntimeHookServiceDeps> = {},
): RuntimeHookServiceDeps {
  return {
    loadPluginHooks: mock(async () => {}),
    clearPluginHookCache: mock(() => {}),
    pruneRemovedPluginHooks: mock(async () => {}),
    setupPluginHookHotReload: mock(() => {}),
    logError: mock(() => {}),
    ...overrides,
  }
}

const plugin = {
  name: 'plugin-one',
  source: 'plugin-one@local',
  hooksConfig: {
    PreToolUse: [
      {
        matcher: 'Bash(*)',
        hooks: [{ type: 'command', command: 'echo pre' }],
      },
    ],
    Stop: [
      {
        matcher: '*',
        hooks: [
          { type: 'command', command: 'echo stop' },
          { type: 'command', command: 'echo stop-2' },
        ],
      },
    ],
  },
} as unknown as LoadedPlugin

describe('RuntimeHookService', () => {
  test('counts plugin hooks from runtime-owned plugin descriptors', () => {
    expect(countRuntimePluginHooks([plugin])).toBe(3)
  })

  test('refreshes plugin hooks and returns hook count', async () => {
    const deps = createDeps()
    const service = createRuntimeHookService(deps)

    const result = await service.refreshPluginHooks({
      enabledPlugins: [plugin],
      errors: [],
    })

    expect(deps.loadPluginHooks).toHaveBeenCalled()
    expect(result).toEqual({
      hook_count: 3,
      hook_load_failed: false,
    })
  })

  test('records hook reload failures in the shared plugin error list', async () => {
    const deps = createDeps({
      loadPluginHooks: mock(async () => {
        throw new Error('hook parse failed')
      }),
    })
    const errors: PluginError[] = []
    const service = createRuntimeHookService(deps)

    const result = await service.refreshPluginHooks({
      enabledPlugins: [plugin],
      errors,
    })

    expect(deps.logError).toHaveBeenCalled()
    expect(result.hook_load_failed).toBe(true)
    expect(errors).toEqual([
      {
        type: 'generic-error',
        source: 'plugin-hooks',
        error: 'Failed to load plugin hooks: hook parse failed',
      },
    ])
  })
})
