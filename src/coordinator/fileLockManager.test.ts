import { afterEach, describe, expect, test } from 'bun:test'

import {
  acquireFileLock,
  getFileLockOwner,
  resetFileLockStateForTests,
  transferAgentLocks,
} from './fileLockManager.js'

afterEach(() => {
  resetFileLockStateForTests()
})

describe('fileLockManager', () => {
  test('allows the same worker to reacquire the same file lock', () => {
    const first = acquireFileLock('src/app.ts', 'agent-a', {
      sourceTool: 'FileEditTool',
    })
    const second = acquireFileLock('src/app.ts', 'agent-a', {
      sourceTool: 'FileWriteTool',
    })

    expect(first.success).toBe(true)
    expect(second.success).toBe(true)
    expect(getFileLockOwner('src/app.ts')).toBe('agent-a')
  })

  test('rejects concurrent writers for the same file', () => {
    acquireFileLock('src/app.ts', 'agent-a', {
      sourceTool: 'FileEditTool',
    })
    const conflict = acquireFileLock('src/app.ts', 'agent-b', {
      sourceTool: 'FileWriteTool',
    })

    expect(conflict.success).toBe(false)
    if (!conflict.success) {
      expect(conflict.conflict.agentId).toBe('agent-a')
      expect(conflict.conflict.sourceTool).toBe('FileEditTool')
    }
  })

  test('transfers locks to a new worker id', () => {
    acquireFileLock('src/app.ts', 'agent-a')

    expect(transferAgentLocks('agent-a', 'agent-b')).toBe(1)
    expect(getFileLockOwner('src/app.ts')).toBe('agent-b')
  })
})
