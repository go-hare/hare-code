import * as React from 'react'

export type TerminalToolOverlay = {
  jsx: React.ReactNode | null
  shouldHidePromptInput: boolean
  shouldContinueAnimation?: true
  showSpinner?: boolean
  isLocalJSXCommand?: boolean
  isImmediate?: boolean
}

type TerminalToolOverlayUpdate = TerminalToolOverlay & {
  clearLocalJSX?: boolean
}

export function useTerminalToolOverlayState() {
  const [toolJSX, setToolJSXInternal] =
    React.useState<TerminalToolOverlay | null>(null)
  const localJSXCommandRef = React.useRef<
    (TerminalToolOverlay & { isLocalJSXCommand: true }) | null
  >(null)

  const setToolJSX = React.useCallback(
    (args: TerminalToolOverlayUpdate | null) => {
      if (args === null) {
        localJSXCommandRef.current = null
        setToolJSXInternal(null)
        return
      }

      if (args?.isLocalJSXCommand) {
        const { clearLocalJSX: _, ...rest } = args
        localJSXCommandRef.current = {
          ...rest,
          isLocalJSXCommand: true,
        }
        setToolJSXInternal(rest)
        return
      }

      if (localJSXCommandRef.current) {
        if (args?.clearLocalJSX) {
          localJSXCommandRef.current = null
          setToolJSXInternal(null)
          return
        }

        return
      }

      if (args?.clearLocalJSX) {
        setToolJSXInternal(null)
        return
      }

      setToolJSXInternal(args)
    },
    [],
  )

  return {
    toolJSX,
    setToolJSX,
    isShowingLocalJSXCommand:
      toolJSX?.isLocalJSXCommand === true && toolJSX?.jsx != null,
  } as const
}
