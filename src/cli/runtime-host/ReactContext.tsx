import React, { useContext, useSyncExternalStore } from 'react'
import type { CliRuntimeHostAdapter } from './CliRuntimeHostAdapter.js'
import type { CliRuntimeHostViewState } from './types.js'

type Props = {
  adapter?: CliRuntimeHostAdapter
  children: React.ReactNode
}

const CliRuntimeHostAdapterContext =
  React.createContext<CliRuntimeHostAdapter | undefined>(undefined)

export function CliRuntimeHostProvider({
  adapter,
  children,
}: Props): React.ReactNode {
  return (
    <CliRuntimeHostAdapterContext.Provider value={adapter}>
      {children}
    </CliRuntimeHostAdapterContext.Provider>
  )
}

export function useCliRuntimeHostAdapterMaybe():
  | CliRuntimeHostAdapter
  | undefined {
  return useContext(CliRuntimeHostAdapterContext)
}

export function useCliRuntimeHostStateMaybe():
  | CliRuntimeHostViewState
  | undefined {
  const adapter = useCliRuntimeHostAdapterMaybe()
  return useSyncExternalStore(
    adapter ? listener => adapter.subscribe(listener) : () => () => {},
    adapter ? () => adapter.getSnapshot() : () => undefined,
    () => undefined,
  )
}
