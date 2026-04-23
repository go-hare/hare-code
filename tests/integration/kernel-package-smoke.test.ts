import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const packageJson = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
) as {
  exports?: Record<string, { import?: string; default?: string } | string>
}

describe('kernel package smoke', () => {
  test('declares ./kernel export pointing at dist/kernel.js', () => {
    const kernelExport = packageJson.exports?.['./kernel']
    expect(kernelExport).toBeDefined()
    expect(typeof kernelExport).toBe('object')
    expect((kernelExport as { import?: string }).import).toBe('./dist/kernel.js')
    expect((kernelExport as { default?: string }).default).toBe('./dist/kernel.js')
  })

  test('imports the built package-level kernel entry', async () => {
    expect(existsSync(join(process.cwd(), 'dist', 'kernel.js'))).toBe(true)

    const kernel = await import('@go-hare/hare-code/kernel')

    expect(typeof kernel.runKernelHeadless).toBe('function')
    expect(typeof kernel.createDefaultKernelHeadlessEnvironment).toBe('function')
    expect(typeof kernel.createDirectConnectSession).toBe('function')
    expect(typeof kernel.runBridgeHeadless).toBe('function')
    expect(typeof kernel.runDaemonWorker).toBe('function')
    expect(kernel.createKernelSession).toBe(kernel.createDirectConnectSession)
  })
})
