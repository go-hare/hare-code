/**
 * Stable public kernel API for external consumers.
 *
 * This surface is intentionally narrower than `src/runtime`: callers should
 * use it when they need to start a server, create/connect direct sessions,
 * or consume stable kernel-facing types without depending on internal layout.
 *
 * Semver contract:
 * - `src/kernel/index.ts` is the only source-level public kernel surface.
 * - the package-level `./kernel` entry re-exports this file and shares the
 *   same stability guarantee.
 * - leaf modules under `src/kernel/*` remain host-internal implementation
 *   surfaces and are not covered by the public semver promise.
 */
export {
  createDefaultKernelHeadlessEnvironment,
  createKernelHeadlessSession,
  createKernelHeadlessStore,
  runKernelHeadless,
} from './headless.js'
export { connectDefaultKernelHeadlessMcp } from './headlessMcp.js'
export { prepareKernelHeadlessStartup } from './headlessStartup.js'
export type { KernelHeadlessMcpConnectOptions } from './headlessMcp.js'
export type {
  PrepareKernelHeadlessStartupDeps,
  PrepareKernelHeadlessStartupOptions,
} from './headlessStartup.js'
export type {
  DefaultKernelHeadlessEnvironmentOptions,
  KernelHeadlessEnvironment,
  KernelHeadlessInput,
  KernelHeadlessRunOptions,
  KernelHeadlessSession,
  KernelHeadlessStore,
} from './headless.js'
export type {
  KernelRuntimeEnvelopeBase,
  KernelRuntimeEnvelopeKind,
  KernelRuntimeErrorCode,
  KernelRuntimeErrorPayload,
  KernelRuntimeEventSink,
} from '../runtime/contracts/events.js'
export {
  createDirectConnectSession as createKernelSession,
  connectDirectHostSession,
  applyDirectConnectSessionState,
  assembleServerHost,
  getDirectConnectErrorMessage,
  createDirectConnectSession,
  DirectConnectError,
  runConnectHeadless as runKernelHeadlessClient,
  runConnectHeadless,
  startServer as startKernelServer,
  startServer,
} from './serverHost.js'
export {
  connectResponseSchema,
  type DirectConnectConfig,
  type ServerConfig,
  type SessionIndex,
  type SessionIndexEntry,
  type SessionInfo,
  type SessionState,
} from '../server/types.js'
export { runBridgeHeadless } from './bridge.js'
export { runDaemonWorker } from './daemon.js'
export {
  createKernelRuntimeEventFacade,
  consumeKernelRuntimeEventMessage,
  getKernelEventFromEnvelope,
  getKernelRuntimeEnvelopeFromMessage,
  isKernelRuntimeEnvelope,
  KernelRuntimeEventReplayError,
  toKernelRuntimeEventMessage,
} from './events.js'
export type {
  KernelRuntimeEventMessage,
  KernelRuntimeEventFacade,
  KernelRuntimeEventFacadeOptions,
  KernelRuntimeEventInput,
  KernelRuntimeEventReplayRequest,
} from './events.js'
export {
  createKernelPermissionBroker,
  KernelPermissionBrokerDisposedError,
  KernelPermissionDecisionError,
} from './permissions.js'
export type {
  KernelPermissionBroker,
  KernelPermissionBrokerOptions,
  KernelPermissionBrokerSnapshot,
  KernelPermissionDecisionHandler,
  KernelPermissionSessionGrantKeyFactory,
} from './permissions.js'
export {
  createDefaultKernelRuntimeWireRouter,
  createKernelRuntimeInProcessWireTransport,
  createKernelRuntimeStdioWireTransport,
  createKernelRuntimeWireClient,
  KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
  runKernelRuntimeWireProtocol,
} from './wireProtocol.js'
export type {
  KernelCapabilityDescriptor,
  KernelCapabilityReloadScope,
  KernelEvent,
  KernelPermissionDecision,
  KernelPermissionDecisionSource,
  KernelPermissionDecisionValue,
  KernelPermissionRequest,
  KernelPermissionRequestId,
  KernelPermissionRisk,
  KernelRuntimeCommand,
  KernelRuntimeCommandType,
  KernelRuntimeConnectHostCommand,
  KernelRuntimeDecidePermissionCommand,
  KernelRuntimeDisconnectHostCommand,
  KernelRuntimeHeadlessProcessExecutorOptions,
  KernelRuntimeHostDisconnectPolicy,
  KernelRuntimeHostIdentity,
  KernelRuntimeHostKind,
  KernelRuntimeTransportKind,
  KernelRuntimeTrustLevel,
  KernelRuntimeInProcessWireTransportOptions,
  KernelRuntimeStdioWireTransportOptions,
  KernelRuntimeWireClient,
  KernelRuntimeWireClientCommand,
  KernelRuntimeWireClientOptions,
  KernelRuntimeWireCapabilityResolver,
  KernelRuntimeWireConversationRecoverySnapshot,
  KernelRuntimeWireConversationSnapshotStore,
  KernelRuntimeWirePermissionBroker,
  KernelRuntimeWireProtocolOptions,
  KernelRuntimeWireRouter,
  KernelRuntimeWireRunnerOptions,
  KernelRuntimeWireTransport,
  KernelRuntimeWireTurnExecutionContext,
  KernelRuntimeWireTurnExecutionEvent,
  KernelRuntimeWireTurnExecutionResult,
  KernelRuntimeWireTurnExecutor,
} from './wireProtocol.js'
