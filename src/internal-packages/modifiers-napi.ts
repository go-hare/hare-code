const FLAG_SHIFT = 0x20000
const FLAG_CONTROL = 0x40000
const FLAG_OPTION = 0x80000
const FLAG_COMMAND = 0x100000

const modifierFlags: Record<string, number> = {
  shift: FLAG_SHIFT,
  control: FLAG_CONTROL,
  option: FLAG_OPTION,
  command: FLAG_COMMAND,
}

const kCGEventSourceStateCombinedSessionState = 0

let cgEventSourceFlagsState: ((stateID: number) => number) | null = null

function loadFFI(): void {
  if (cgEventSourceFlagsState !== null || process.platform !== 'darwin') {
    return
  }

  try {
    // Delay bun:ffi loading so Node/Electron can import the SDK bundle
    // without immediately tripping over a Bun-only module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffi = require('bun:ffi') as typeof import('bun:ffi')
    const lib = ffi.dlopen('/System/Library/Frameworks/Carbon.framework/Carbon', {
      CGEventSourceFlagsState: {
        args: [ffi.FFIType.i32],
        returns: ffi.FFIType.u64,
      },
    })
    cgEventSourceFlagsState = (stateID: number): number =>
      Number(lib.symbols.CGEventSourceFlagsState(stateID))
  } catch {
    cgEventSourceFlagsState = null
  }
}

export function prewarm(): void {
  loadFFI()
}

export function isModifierPressed(modifier: string): boolean {
  if (process.platform !== 'darwin') {
    return false
  }

  loadFFI()

  if (cgEventSourceFlagsState === null) {
    return false
  }

  const flag = modifierFlags[modifier]
  if (flag === undefined) {
    return false
  }

  const currentFlags = cgEventSourceFlagsState(
    kCGEventSourceStateCombinedSessionState,
  )
  return (currentFlags & flag) !== 0
}
