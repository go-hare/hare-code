import { describe, expect, test } from 'bun:test'
import { randomUUID } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { createServerSessionIndexStore } from '../ServerSessionIndexStore.js'

describe('createServerSessionIndexStore', () => {
  test('recovers from a corrupt index file on the next write', async () => {
    const dir = join(tmpdir(), `hare-server-index-${randomUUID()}`)
    const path = join(dir, 'server-sessions.json')
    await mkdir(dir, { recursive: true })
    await writeFile(path, '\0not json')

    const store = createServerSessionIndexStore(path)
    expect(await store.list()).toEqual([])

    await store.upsert('session-1', {
      sessionId: 'session-1',
      transcriptSessionId: 'transcript-1',
      cwd: '/tmp/work',
      createdAt: 1,
      lastActiveAt: 2,
    })

    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({
      'session-1': {
        sessionId: 'session-1',
        transcriptSessionId: 'transcript-1',
        cwd: '/tmp/work',
        createdAt: 1,
        lastActiveAt: 2,
      },
    })
  })
})
