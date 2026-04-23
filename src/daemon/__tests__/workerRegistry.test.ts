import { describe, expect, test } from 'bun:test'

const workerRegistry = await import('../workerRegistry.js')
const kernelDaemon = await import('../../kernel/daemon.js')

describe('runDaemonWorker', () => {
  test('re-exports the kernel daemon entry', () => {
    expect(workerRegistry.runDaemonWorker).toBe(kernelDaemon.runDaemonWorker)
  })
})
