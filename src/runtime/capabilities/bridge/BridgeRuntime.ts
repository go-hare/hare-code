import type { HeadlessBridgeOpts } from '../../../bridge/bridgeMain.js'
import {
  createSessionPersistenceOwner,
  type RuntimeSessionPersistenceOwner,
} from '../persistence/SessionPersistenceOwner.js'

export type BridgeCliEntry = (args: string[]) => Promise<void>
export type BridgeHeadlessEntry = (
  opts: HeadlessBridgeOpts,
  signal: AbortSignal,
) => Promise<void>

export interface BridgeRuntimeCapability {
  createPersistenceOwner(sessionId: string): RuntimeSessionPersistenceOwner
  runCliHost(args: string[], legacy: BridgeCliEntry): Promise<void>
  runHeadlessHost(
    opts: HeadlessBridgeOpts,
    signal: AbortSignal,
    legacy: BridgeHeadlessEntry,
  ): Promise<void>
}

export function createBridgeRuntimeCapability(): BridgeRuntimeCapability {
  return {
    createPersistenceOwner(sessionId) {
      return createSessionPersistenceOwner(sessionId)
    },
    runCliHost(args, legacy) {
      return legacy(args)
    },
    runHeadlessHost(opts, signal, legacy) {
      return legacy(opts, signal)
    },
  }
}

export function runBridgeCliRuntime(
  args: string[],
  legacy: BridgeCliEntry,
): Promise<void> {
  return createBridgeRuntimeCapability().runCliHost(args, legacy)
}

export function runBridgeHeadlessRuntime(
  opts: HeadlessBridgeOpts,
  signal: AbortSignal,
  legacy: BridgeHeadlessEntry,
): Promise<void> {
  return createBridgeRuntimeCapability().runHeadlessHost(opts, signal, legacy)
}

export function createBridgePersistenceOwner(sessionId: string) {
  return createBridgeRuntimeCapability().createPersistenceOwner(sessionId)
}
