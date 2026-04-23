import { describe, expect, test } from 'bun:test'
import { readFile } from 'fs/promises'
import { join } from 'path'

const repoRoot = process.cwd()

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(join(repoRoot, relativePath), 'utf8')
}

describe('server runtime contracts', () => {
  test('defines the runtime-owned backend and logger contracts', async () => {
    const content = await readRepoFile(
      'src/runtime/capabilities/server/contracts.ts',
    )

    expect(content).toContain('export interface SessionRuntimeHandle')
    expect(content).toContain('export interface SessionRuntimeBackend')
    expect(content).toContain('export interface SessionLogger')
    expect(content).toContain('export const noopSessionLogger')
  })

  test('session manager and direct-connect session depend on contracts, not server implementations', async () => {
    const sessionManager = await readRepoFile(
      'src/runtime/capabilities/server/SessionManager.ts',
    )
    const directSession = await readRepoFile(
      'src/runtime/capabilities/server/RuntimeDirectConnectSession.ts',
    )

    expect(sessionManager).toContain("from './contracts.js'")
    expect(sessionManager).not.toContain('server/backends/dangerousBackend.js')
    expect(sessionManager).not.toContain('server/serverLog.js')

    expect(directSession).toContain("from './contracts.js'")
    expect(directSession).not.toContain('server/backends/dangerousBackend.js')
    expect(directSession).not.toContain('server/serverLog.js')
  })
})
