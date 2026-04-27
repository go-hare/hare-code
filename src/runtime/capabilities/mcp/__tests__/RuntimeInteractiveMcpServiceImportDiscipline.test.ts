import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const content = readFileSync(
  join(import.meta.dir, '../RuntimeInteractiveMcpService.ts'),
  'utf8',
)

describe('RuntimeInteractiveMcpService import discipline', () => {
  test('does not import bootstrap state directly', () => {
    expect(content).not.toContain('bootstrap/state.js')
  })

  test('accepts channel allowlist through the host option seam', () => {
    expect(content).toContain(
      'getAllowedChannels?: () => Parameters<typeof gateChannelServer>[3]',
    )
  })
})
