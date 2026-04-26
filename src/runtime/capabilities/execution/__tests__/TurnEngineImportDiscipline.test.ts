import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = join(import.meta.dir, '../../../../..')
const turnEngineContent = readFileSync(
  join(
    repoRoot,
    'src/runtime/capabilities/execution/TurnEngine.ts',
  ),
  'utf8',
)

describe('TurnEngine import discipline', () => {
  test('does not import bootstrap state directly', () => {
    expect(turnEngineContent).not.toContain(
      "from '../../../bootstrap/state.js'",
    )
  })

  test('accepts session identity through its options seam', () => {
    expect(turnEngineContent).toContain('getSessionId: () => string')
  })
})
