import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = join(import.meta.dir, '../../../../..')
const content = readFileSync(
  join(
    repoRoot,
    'src/runtime/capabilities/execution/HeadlessRuntime.ts',
  ),
  'utf8',
)

describe('runHeadlessRuntime', () => {
  test('creates a bootstrap-backed runtime state provider', () => {
    expect(content).toContain(
      'const bootstrapStateProvider = createBootstrapStateProvider()',
    )
  })

  test('passes the bootstrap state provider through the headless entry seam', () => {
    expect(content).toContain('bootstrapStateProvider,')
  })
})
