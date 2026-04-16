import { createRuntimeHostSession, type CreateRuntimeHostSessionOptions } from '../../sdk/index.js'
import { CliRuntimeHostAdapter } from './CliRuntimeHostAdapter.js'
import type { CliRuntimeHostAdapterOptions } from './types.js'

export type CreateCliRuntimeHostAdapterOptions = CreateRuntimeHostSessionOptions &
  CliRuntimeHostAdapterOptions

export function createCliRuntimeHostAdapter(
  options: CreateCliRuntimeHostAdapterOptions = {},
): CliRuntimeHostAdapter {
  const { maxNotifications, maxRecentEvents, ...runtimeOptions } = options
  const session = createRuntimeHostSession(runtimeOptions)
  return new CliRuntimeHostAdapter(session, {
    maxNotifications,
    maxRecentEvents,
  })
}
