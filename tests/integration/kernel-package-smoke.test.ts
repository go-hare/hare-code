import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const packageJson = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
) as {
  exports?: Record<string, { import?: string; default?: string } | string>
}

const EXPECTED_KERNEL_EXPORTS = [
  'DirectConnectError',
  'applyDirectConnectSessionState',
  'assembleServerHost',
  'connectDefaultKernelHeadlessMcp',
  'connectDirectHostSession',
  'connectResponseSchema',
  'createDefaultKernelHeadlessEnvironment',
  'createDirectConnectSession',
  'createKernelHeadlessSession',
  'createKernelHeadlessStore',
  'createKernelSession',
  'getDirectConnectErrorMessage',
  'prepareKernelHeadlessStartup',
  'runBridgeHeadless',
  'runConnectHeadless',
  'runDaemonWorker',
  'runKernelHeadless',
  'runKernelHeadlessClient',
  'startKernelServer',
  'startServer',
] as const

function parsePackJson(output: string): Array<{ filename: string }> {
  const match = output.match(/(\[\s*\{[\s\S]*\}\s*\])\s*$/)
  if (!match) {
    throw new Error(`npm pack did not return JSON output:\n${output}`)
  }
  return JSON.parse(match[1]) as Array<{ filename: string }>
}

describe('kernel package smoke', () => {
  test('declares ./kernel export pointing at dist/kernel.js', () => {
    const kernelExport = packageJson.exports?.['./kernel']
    expect(kernelExport).toBeDefined()
    expect(typeof kernelExport).toBe('object')
    expect((kernelExport as { import?: string }).import).toBe('./dist/kernel.js')
    expect((kernelExport as { default?: string }).default).toBe('./dist/kernel.js')
  })

  test(
    'imports the built package-level kernel entry',
    async () => {
      if (!existsSync(join(process.cwd(), 'dist', 'kernel.js'))) {
        execFileSync('bun', ['run', 'build'], {
          cwd: process.cwd(),
          encoding: 'utf8',
        })
      }

      const tempRoot = mkdtempSync(join(tmpdir(), 'hare-kernel-package-'))
      const consumerDir = join(tempRoot, 'consumer')
      mkdirSync(consumerDir, { recursive: true })
      writeFileSync(
        join(consumerDir, 'package.json'),
        JSON.stringify({
          name: 'kernel-smoke-consumer',
          private: true,
          type: 'module',
        }),
        'utf8',
      )

      try {
        const packOutput = execFileSync(
          'npm',
          ['pack', '--json', '--ignore-scripts', '--pack-destination', tempRoot],
          {
            cwd: process.cwd(),
            encoding: 'utf8',
          },
        )
        const [{ filename }] = parsePackJson(packOutput)
        const tarballPath = join(tempRoot, filename)

        expect(existsSync(tarballPath)).toBe(true)

        execFileSync(
          'npm',
          ['install', '--ignore-scripts', '--no-package-lock', tarballPath],
          {
            cwd: consumerDir,
            encoding: 'utf8',
          },
        )

        const exportedKeys = JSON.parse(
          execFileSync(
            'node',
            [
              '--input-type=module',
              '-e',
              `import('@go-hare/hare-code/kernel').then(mod => process.stdout.write(JSON.stringify(Object.keys(mod).sort()))).catch(err => { console.error(err); process.exit(1) })`,
            ],
            {
              cwd: consumerDir,
              encoding: 'utf8',
            },
          ),
        ) as string[]

        expect(exportedKeys).toEqual([...EXPECTED_KERNEL_EXPORTS].sort())
      } finally {
        rmSync(tempRoot, { recursive: true, force: true })
      }
    },
    { timeout: 120_000 },
  )
})
