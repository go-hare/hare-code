import { describe, expect, test } from 'bun:test'
import { readFile } from 'fs/promises'
import { join } from 'path'

const repoRoot = process.cwd()

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(join(repoRoot, relativePath), 'utf8')
}

describe('bridge runtime contracts', () => {
  test('headless bridge entry depends on bridge types instead of bridgeMain', async () => {
    const entry = await readRepoFile(
      'src/runtime/capabilities/bridge/HeadlessBridgeEntry.ts',
    )
    const types = await readRepoFile('src/bridge/types.ts')

    expect(entry).toContain("from '../../../bridge/types.js'")
    expect(entry).not.toContain("from '../../../bridge/bridgeMain.js'")
    expect(types).toContain('export type BackoffConfig = {')
  })
})
