import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const content = readFileSync(
  join(import.meta.dir, '../headlessBootstrap.ts'),
  'utf8',
)
const sessionBootstrapContent = readFileSync(
  join(import.meta.dir, '../headlessSessionBootstrap.ts'),
  'utf8',
)

describe('headlessBootstrap import discipline', () => {
  test('does not import bootstrap state directly', () => {
    expect(content).not.toContain("from 'src/bootstrap/state.js'")
  })

  test('reads bootstrap state through the runtime provider seam', () => {
    expect(content).toContain(
      'bootstrapStateProvider: RuntimeSessionIdentityStateProvider',
    )
    expect(content).toContain(
      'bootstrapStateProvider.getSessionIdentity().sessionId',
    )
  })

  test('keeps resumed session bootstrap scoped to identity and prompt state', () => {
    expect(sessionBootstrapContent).not.toContain(
      "from 'src/bootstrap/state.js'",
    )
    expect(sessionBootstrapContent).toContain(
      'RuntimeSessionIdentityStateProvider & RuntimePromptStateProvider',
    )
  })
})
