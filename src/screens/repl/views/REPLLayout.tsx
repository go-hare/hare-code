import * as React from 'react'
import { AlternateScreen } from '@anthropic/ink'
import { KeybindingSetup } from '../../../keybindings/KeybindingProviderSetup.js'

type REPLLayoutProps = {
  useAlternateScreen?: boolean
  mouseTrackingEnabled?: boolean
  children: React.ReactNode
}

/**
 * Minimal REPL layout shell.
 * Owns only the outer KeybindingSetup + optional AlternateScreen wrapper.
 * All execution state and layout decisions stay in REPL.tsx for now.
 */
export function REPLLayout({
  useAlternateScreen = false,
  mouseTrackingEnabled = false,
  children,
}: REPLLayoutProps): React.ReactNode {
  const content = <KeybindingSetup>{children}</KeybindingSetup>

  if (!useAlternateScreen) {
    return content
  }

  return (
    <AlternateScreen mouseTracking={mouseTrackingEnabled}>
      {content}
    </AlternateScreen>
  )
}
