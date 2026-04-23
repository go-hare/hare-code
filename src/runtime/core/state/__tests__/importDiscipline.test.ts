import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const adaptersContent = readFileSync(
  join(process.cwd(), 'src/runtime/core/state/adapters.ts'),
  'utf8',
)
const bootstrapProviderContent = readFileSync(
  join(process.cwd(), 'src/runtime/core/state/bootstrapProvider.ts'),
  'utf8',
)

describe('runtime core state import discipline', () => {
  test('keeps bootstrap singleton wiring out of adapters', () => {
    expect(adaptersContent).not.toContain("from 'src/bootstrap/state.js'")
  })

  test('isolates bootstrap singleton wiring in bootstrapProvider', () => {
    expect(bootstrapProviderContent).toContain(
      "from 'src/bootstrap/state.js'",
    )
  })
})
