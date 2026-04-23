import { describe, expect, test } from 'bun:test'
import { readFile } from 'fs/promises'
import { join } from 'path'

const repoRoot = process.cwd()

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(join(repoRoot, relativePath), 'utf8')
}

async function expectNotToContain(
  relativePath: string,
  forbiddenPatterns: RegExp[],
): Promise<void> {
  const content = await readRepoFile(relativePath)
  for (const pattern of forbiddenPatterns) {
    expect(pattern.test(content)).toBe(false)
  }
}

describe('kernel import discipline', () => {
  test('main host does not bypass kernel for direct-connect session wiring', async () => {
    await expectNotToContain('src/main.tsx', [
      /import\s*\(\s*['"].\/server\/createDirectConnectSession\.js['"]\s*\)/,
      /\bcreateDirectConnectSession\(/,
      /\bDirectConnectError\b/,
      /\bapplyDirectConnectSessionState\(/,
    ])
  })

  test('bridge host no longer reaches around kernel bridge session/runtime seams', async () => {
    await expectNotToContain('src/bridge/bridgeMain.ts', [
      /import\('\.\/createSession\.js'\)/,
      /runHeadlessBridgeRuntime\(/,
    ])
  })

  test('daemon host no longer wires bridge runtime directly', async () => {
    await expectNotToContain('src/daemon/workerRegistry.ts', [
      /bridgeMain\.js/,
      /hosts\/daemon/,
      /BridgeHeadlessPermanentError/,
    ])
  })

  test('cli host commands stay off direct-connect and server implementation internals', async () => {
    await expectNotToContain('src/hosts/cli/registerCliHostCommands.ts', [
      /\bcreateDirectConnectSession\(/,
      /\bDirectConnectError\b/,
      /\bassembleServerHost\(/,
      /server\/sessionManager\.js/,
      /server\/backends\/dangerousBackend\.js/,
      /server\/serverLog\.js/,
      /server\/serverBanner\.js/,
      /server\/lockfile\.js/,
      /process\.once\(\s*['"]SIGINT['"]/,
      /process\.once\(\s*['"]SIGTERM['"]/,
    ])
  })

  test('remote-control host surface re-exports from kernel instead of runtime bridge internals', async () => {
    await expectNotToContain('src/hosts/remote-control/index.ts', [
      /runtime\/capabilities\/bridge\/BridgeRuntime\.js/,
    ])
  })

  test('daemon host surface re-exports from kernel instead of runtime daemon internals', async () => {
    await expectNotToContain('src/hosts/daemon/index.ts', [
      /runtime\/capabilities\/daemon\/DaemonWorkerRuntime\.js/,
      /\brunDaemonWorkerRuntime\b/,
    ])
  })
})
