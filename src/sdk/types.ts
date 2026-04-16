/**
 * Canonical SDK type surface for internal and host-facing imports.
 *
 * Keep legacy entrypoint facades outside this module; internal code should import
 * SDK message, hook, permission, and tool types from here.
 */

export type {
  SDKControlRequest,
  SDKControlResponse,
} from '../entrypoints/sdk/controlTypes.js'

export * from '../entrypoints/sdk/coreTypes.js'
export type * from '../entrypoints/sdk/runtimeTypes.js'
export type * from '../entrypoints/sdk/toolTypes.js'

export type { Settings } from '../entrypoints/sdk/settingsTypes.generated.js'

// Preserve the historical loose typing from the legacy façade so this cleanup
// does not silently tighten hook callsites across the codebase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HookEvent = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ExitReason = any
