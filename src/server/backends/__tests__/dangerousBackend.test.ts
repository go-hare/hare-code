import { describe, expect, mock, test } from 'bun:test'
import {
  DangerousBackend,
  type DangerousBackendDeps,
} from '../dangerousBackend.js'

const spawnMock = mock(
  (_command: string, _args: readonly string[], _options: unknown) => ({
    stdin: {
      destroyed: false,
      writable: true,
      write: mock(() => true),
    },
    stdout: {},
    stderr: {},
    kill: mock(() => true),
  }),
)

describe('DangerousBackend', () => {
  test('starts stream-json sessions with stdio permission prompts enabled', () => {
    const backend = new DangerousBackend({
      spawn: spawnMock as unknown as DangerousBackendDeps['spawn'],
    })

    backend.createSessionRuntime({
      cwd: '/tmp/project',
      sessionId: 'session-1',
    })

    const args = spawnMock.mock.calls[0]?.[1] ?? []
    expect(args).toContain('--permission-prompt-tool')
    expect(args.at(args.indexOf('--permission-prompt-tool') + 1)).toBe('stdio')
  })
})
