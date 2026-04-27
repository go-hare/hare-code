import { describe, expect, test } from 'bun:test'
import { readFile } from 'fs/promises'
import { join } from 'path'

import * as kernel from '../index.js'

const repoRoot = join(import.meta.dir, '../../..')
const EXPECTED_KERNEL_EXPORTS = [
  'KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION',
  'DirectConnectError',
  'applyDirectConnectSessionState',
  'assembleServerHost',
  'connectDefaultKernelHeadlessMcp',
  'connectDirectHostSession',
  'connectResponseSchema',
  'consumeKernelRuntimeEventMessage',
  'createDefaultKernelHeadlessEnvironment',
  'createDefaultKernelRuntimeWireRouter',
  'createDirectConnectSession',
  'createKernelHeadlessSession',
  'createKernelHeadlessStore',
  'createKernelPermissionBroker',
  'createKernelRuntimeEventFacade',
  'createKernelRuntimeInProcessWireTransport',
  'createKernelRuntimeStdioWireTransport',
  'createKernelRuntimeWireClient',
  'createKernelSession',
  'getDirectConnectErrorMessage',
  'getKernelEventFromEnvelope',
  'getKernelRuntimeEnvelopeFromMessage',
  'isKernelRuntimeEnvelope',
  'KernelPermissionBrokerDisposedError',
  'KernelPermissionDecisionError',
  'KernelRuntimeEventReplayError',
  'prepareKernelHeadlessStartup',
  'runBridgeHeadless',
  'runConnectHeadless',
  'runDaemonWorker',
  'runKernelHeadless',
  'runKernelHeadlessClient',
  'runKernelRuntimeWireProtocol',
  'startKernelServer',
  'startServer',
  'toKernelRuntimeEventMessage',
] as const

const packageEntry = await import('../../entrypoints/kernel.js')
const packageJson = JSON.parse(
  await readFile(join(repoRoot, 'package.json'), 'utf8'),
) as {
  exports?: Record<
    string,
    {
      types?: string
      import?: string
      default?: string
    }
  >
  bin?: Record<string, string>
}

describe('kernel package entry', () => {
  test('declares the package-level ./kernel export', () => {
    expect(packageJson.exports).toBeDefined()
    expect(packageJson.exports?.['./kernel']).toBeDefined()
  })

  test('publishes a standalone declaration file for the ./kernel surface', async () => {
    const kernelExport = packageJson.exports?.['./kernel']
    expect(kernelExport?.types).toBe('./src/kernel/index.d.ts')

    const declaration = await readFile(
      join(repoRoot, kernelExport!.types!),
      'utf8',
    )

    expect(declaration).toContain('export type KernelHeadlessEnvironment = {')
    expect(declaration).toContain('runtimeEventSink?: KernelRuntimeEventSink')
    expect(declaration).toContain("schemaVersion: 'kernel.runtime.v1'")
    expect(declaration).toContain('KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION:')
    expect(declaration).toContain('runKernelRuntimeWireProtocol(')
    expect(declaration).toContain("KernelRuntimeCommandBase<'connect_host'>")
    expect(declaration).toContain(
      "KernelRuntimeCommandBase<'decide_permission'>",
    )
    expect(declaration).toContain('decidePermission(')
    expect(declaration).toContain('requestPermission(')
    expect(declaration).toContain(
      'permissionBroker?: KernelRuntimeWirePermissionBroker',
    )
    expect(declaration).toContain('eventJournalPath?: string | false')
    expect(declaration).toContain('conversationJournalPath?: string | false')
    expect(declaration).toContain(
      'capabilityResolver?: KernelRuntimeWireCapabilityResolver',
    )
    expect(declaration).toContain('export type KernelRuntimeEventFacade = {')
    expect(declaration).toContain('createKernelRuntimeEventFacade(')
    expect(declaration).toContain("export type KernelRuntimeEventMessage = {")
    expect(declaration).toContain('getKernelRuntimeEnvelopeFromMessage(')
    expect(declaration).toContain('toKernelRuntimeEventMessage(')
    expect(declaration).toContain('consumeKernelRuntimeEventMessage(')
    expect(declaration).toContain('getKernelEventFromEnvelope(')
    expect(declaration).toContain('export type KernelPermissionRequest = {')
    expect(declaration).toContain('export type KernelPermissionBroker = {')
    expect(declaration).toContain('createKernelPermissionBroker(')
    expect(declaration).toContain(
      'export declare class KernelPermissionDecisionError extends Error',
    )
    expect(declaration).toContain('export type KernelRuntimeWireTransport = {')
    expect(declaration).toContain('createKernelRuntimeWireClient(')
    expect(declaration).not.toContain("'src/")
    expect(declaration).not.toContain('"src/')
    expect(declaration).not.toContain('packages/')
  })

  test('declares the package-level kernel runtime bin', () => {
    expect(packageJson.bin?.['hare-kernel-runtime']).toBe(
      'dist/kernel-runtime.js',
    )
  })

  test('re-exports the stable kernel surface through src/entrypoints/kernel.ts', () => {
    expect(Object.keys(packageEntry).sort()).toEqual(
      [...EXPECTED_KERNEL_EXPORTS].sort(),
    )
    expect(
      Object.is(packageEntry.runKernelHeadless, kernel.runKernelHeadless),
    ).toBe(true)
    expect(
      Object.is(
        packageEntry.createDirectConnectSession,
        kernel.createDirectConnectSession,
      ),
    ).toBe(true)
    expect(
      Object.is(packageEntry.runBridgeHeadless, kernel.runBridgeHeadless),
    ).toBe(true)
    expect(
      Object.is(packageEntry.runDaemonWorker, kernel.runDaemonWorker),
    ).toBe(true)
    expect(
      Object.is(
        packageEntry.runKernelRuntimeWireProtocol,
        kernel.runKernelRuntimeWireProtocol,
      ),
    ).toBe(true)
    expect(
      Object.is(
        packageEntry.createDefaultKernelRuntimeWireRouter,
        kernel.createDefaultKernelRuntimeWireRouter,
      ),
    ).toBe(true)
    expect(
      Object.is(
        packageEntry.createKernelPermissionBroker,
        kernel.createKernelPermissionBroker,
      ),
    ).toBe(true)
    expect(packageEntry.KernelPermissionBrokerDisposedError).toBe(
      kernel.KernelPermissionBrokerDisposedError,
    )
    expect(packageEntry.KernelPermissionDecisionError).toBe(
      kernel.KernelPermissionDecisionError,
    )
    expect(
      Object.is(
        packageEntry.createKernelRuntimeEventFacade,
        kernel.createKernelRuntimeEventFacade,
      ),
    ).toBe(true)
    expect(
      Object.is(
        packageEntry.getKernelRuntimeEnvelopeFromMessage,
        kernel.getKernelRuntimeEnvelopeFromMessage,
      ),
    ).toBe(true)
    expect(
      Object.is(
        packageEntry.toKernelRuntimeEventMessage,
        kernel.toKernelRuntimeEventMessage,
      ),
    ).toBe(true)
    expect(
      Object.is(
        packageEntry.consumeKernelRuntimeEventMessage,
        kernel.consumeKernelRuntimeEventMessage,
      ),
    ).toBe(true)
    expect(
      Object.is(
        packageEntry.getKernelEventFromEnvelope,
        kernel.getKernelEventFromEnvelope,
      ),
    ).toBe(true)
    expect(
      Object.is(
        packageEntry.createKernelRuntimeWireClient,
        kernel.createKernelRuntimeWireClient,
      ),
    ).toBe(true)
    expect(
      Object.is(
        packageEntry.createKernelRuntimeInProcessWireTransport,
        kernel.createKernelRuntimeInProcessWireTransport,
      ),
    ).toBe(true)
    expect(
      Object.is(
        packageEntry.createKernelRuntimeStdioWireTransport,
        kernel.createKernelRuntimeStdioWireTransport,
      ),
    ).toBe(true)
    expect(packageEntry.KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION).toBe(
      kernel.KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    )
  })
})
