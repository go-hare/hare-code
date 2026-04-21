/**
 * Internal runtime public surface for advanced callers.
 *
 * Prefer importing from `src/kernel` for stable host-facing entrypoints.
 * This module intentionally exposes runtime internals under namespaces so
 * the public shape can evolve without callers depending on deep file paths.
 */
export * as runtimeContracts from './contracts/index.js'
export * as runtimeCapabilities from './capabilities/index.js'
export * as runtimeState from './core/state/index.js'
