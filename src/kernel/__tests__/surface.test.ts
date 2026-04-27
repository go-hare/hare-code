import { describe, expect, test } from 'bun:test'

import * as bridge from '../bridge.js'
import * as daemon from '../daemon.js'
import * as headless from '../headless.js'
import * as headlessMcp from '../headlessMcp.js'
import * as headlessStartup from '../headlessStartup.js'
import * as events from '../events.js'
import * as kernel from '../index.js'
import * as permissions from '../permissions.js'
import * as serverHost from '../serverHost.js'
import * as wireProtocol from '../wireProtocol.js'
import * as serverTypes from '../../server/types.js'

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

describe('kernel index surface', () => {
  test('locks the exact stable public kernel export set', () => {
    expect(Object.keys(kernel).sort()).toEqual(
      [...EXPECTED_KERNEL_EXPORTS].sort(),
    )
  })

  test('re-exports the stable public kernel API from its leaf modules', () => {
    expect(
      Object.is(
        kernel.createDefaultKernelHeadlessEnvironment,
        headless.createDefaultKernelHeadlessEnvironment,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.createKernelHeadlessSession,
        headless.createKernelHeadlessSession,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.createKernelHeadlessStore,
        headless.createKernelHeadlessStore,
      ),
    ).toBe(true)
    expect(
      Object.is(kernel.runKernelHeadless, headless.runKernelHeadless),
    ).toBe(true)
    expect(
      Object.is(
        kernel.connectDefaultKernelHeadlessMcp,
        headlessMcp.connectDefaultKernelHeadlessMcp,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.prepareKernelHeadlessStartup,
        headlessStartup.prepareKernelHeadlessStartup,
      ),
    ).toBe(true)

    expect(
      Object.is(
        kernel.createKernelSession,
        serverHost.createDirectConnectSession,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.createDirectConnectSession,
        serverHost.createDirectConnectSession,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.connectDirectHostSession,
        serverHost.connectDirectHostSession,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.applyDirectConnectSessionState,
        serverHost.applyDirectConnectSessionState,
      ),
    ).toBe(true)
    expect(
      Object.is(kernel.assembleServerHost, serverHost.assembleServerHost),
    ).toBe(true)
    expect(
      Object.is(kernel.DirectConnectError, serverHost.DirectConnectError),
    ).toBe(true)
    expect(
      Object.is(kernel.runKernelHeadlessClient, serverHost.runConnectHeadless),
    ).toBe(true)
    expect(
      Object.is(kernel.runConnectHeadless, serverHost.runConnectHeadless),
    ).toBe(true)
    expect(Object.is(kernel.startKernelServer, serverHost.startServer)).toBe(
      true,
    )
    expect(Object.is(kernel.startServer, serverHost.startServer)).toBe(true)
    expect(
      Object.is(
        kernel.createKernelRuntimeEventFacade,
        events.createKernelRuntimeEventFacade,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.getKernelRuntimeEnvelopeFromMessage,
        events.getKernelRuntimeEnvelopeFromMessage,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.toKernelRuntimeEventMessage,
        events.toKernelRuntimeEventMessage,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.consumeKernelRuntimeEventMessage,
        events.consumeKernelRuntimeEventMessage,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.getKernelEventFromEnvelope,
        events.getKernelEventFromEnvelope,
      ),
    ).toBe(true)
    expect(
      Object.is(kernel.isKernelRuntimeEnvelope, events.isKernelRuntimeEnvelope),
    ).toBe(true)
    expect(kernel.KernelRuntimeEventReplayError).toBe(
      events.KernelRuntimeEventReplayError,
    )
    expect(
      Object.is(
        kernel.createKernelPermissionBroker,
        permissions.createKernelPermissionBroker,
      ),
    ).toBe(true)
    expect(kernel.KernelPermissionBrokerDisposedError).toBe(
      permissions.KernelPermissionBrokerDisposedError,
    )
    expect(kernel.KernelPermissionDecisionError).toBe(
      permissions.KernelPermissionDecisionError,
    )
    expect(
      Object.is(
        kernel.connectResponseSchema,
        serverTypes.connectResponseSchema,
      ),
    ).toBe(true)

    expect(Object.is(kernel.runBridgeHeadless, bridge.runBridgeHeadless)).toBe(
      true,
    )
    expect(Object.is(kernel.runDaemonWorker, daemon.runDaemonWorker)).toBe(true)
    expect(
      Object.is(
        kernel.createDefaultKernelRuntimeWireRouter,
        wireProtocol.createDefaultKernelRuntimeWireRouter,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.createKernelRuntimeInProcessWireTransport,
        wireProtocol.createKernelRuntimeInProcessWireTransport,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.createKernelRuntimeStdioWireTransport,
        wireProtocol.createKernelRuntimeStdioWireTransport,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.createKernelRuntimeWireClient,
        wireProtocol.createKernelRuntimeWireClient,
      ),
    ).toBe(true)
    expect(
      Object.is(
        kernel.runKernelRuntimeWireProtocol,
        wireProtocol.runKernelRuntimeWireProtocol,
      ),
    ).toBe(true)
    expect(kernel.KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION).toBe(
      wireProtocol.KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    )
  })
})
