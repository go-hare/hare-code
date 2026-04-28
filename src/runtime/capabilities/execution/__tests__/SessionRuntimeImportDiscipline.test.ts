import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = join(import.meta.dir, '../../../../..')
const content = readFileSync(
  join(
    repoRoot,
    'src/runtime/capabilities/execution/SessionRuntime.ts',
  ),
  'utf8',
)

describe('SessionRuntime import discipline', () => {
  test('does not import bootstrap state directly', () => {
    expect(content).not.toContain("from 'src/bootstrap/state.js'")
  })

  test('accepts bootstrap state through the runtime provider seam', () => {
    expect(content).toContain(
      'bootstrapStateProvider: RuntimeExecutionSessionStateProvider',
    )
  })

  test('does not reach into builtin-tools source files by relative path', () => {
    expect(content).not.toContain('packages/builtin-tools/src')
  })
})
