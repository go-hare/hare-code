import { describe, expect, test } from 'bun:test'

import { createHeadlessManagedSession } from '../headlessManagedSession.js'

describe('createHeadlessManagedSession', () => {
  test('manages the active turn abort controller', () => {
    const session = createHeadlessManagedSession([], process.cwd())

    expect(session.getAbortController()).toBeUndefined()

    const abortController = session.startTurn()
    expect(session.getAbortController()).toBe(abortController)
    expect(abortController.signal.aborted).toBe(false)

    session.abortActiveTurn('interrupt')
    expect(abortController.signal.aborted).toBe(true)
  })

  test('merges pending read-state seeds at the commit boundary', () => {
    const session = createHeadlessManagedSession([], process.cwd())
    session.seedReadFileState('/tmp/seeded.txt', {
      content: 'seeded',
      timestamp: 10,
      offset: undefined,
      limit: undefined,
    })

    expect(session.getReadFileCache().get('/tmp/seeded.txt')?.content).toBe(
      'seeded',
    )
    expect(
      session.getCommittedReadFileState().get('/tmp/seeded.txt'),
    ).toBeUndefined()

    const committed = session.getCommittedReadFileState()
    session.commitReadFileCache(committed)

    expect(
      session.getCommittedReadFileState().get('/tmp/seeded.txt')?.content,
    ).toBe('seeded')
    expect(session.getReadFileCache().get('/tmp/seeded.txt')?.content).toBe(
      'seeded',
    )
  })
})
