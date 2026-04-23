import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const remoteIOContent = readFileSync(
  join(
    process.cwd(),
    'src/runtime/capabilities/execution/internal/io/remoteIO.ts',
  ),
  'utf8',
)
const headlessControlContent = readFileSync(
  join(
    process.cwd(),
    'src/runtime/capabilities/execution/internal/headlessControl.ts',
  ),
  'utf8',
)

describe('remote IO import discipline', () => {
  test('does not import bootstrap state directly', () => {
    expect(remoteIOContent).not.toContain("from 'src/bootstrap/state.js'")
  })

  test('requires session identity through the headless control seam', () => {
    expect(headlessControlContent).toContain('sessionId: string')
    expect(headlessControlContent).toContain(
      'new RemoteIO(',
    )
  })
})
