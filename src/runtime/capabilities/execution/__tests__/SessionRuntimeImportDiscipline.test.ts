import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const content = readFileSync(
  join(
    process.cwd(),
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
      'bootstrapStateProvider?: RuntimeBootstrapStateProvider',
    )
  })
})
