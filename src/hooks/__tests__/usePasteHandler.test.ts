import { describe, expect, test } from 'bun:test'
import { shouldUseWindowsClipboardPasteFallback } from '../usePasteHandler.js'

const CTRL_V_KEY = {
  upArrow: false,
  downArrow: false,
  leftArrow: false,
  rightArrow: false,
  pageDown: false,
  pageUp: false,
  wheelUp: false,
  wheelDown: false,
  home: false,
  end: false,
  return: false,
  escape: false,
  ctrl: true,
  shift: false,
  fn: false,
  tab: false,
  backspace: false,
  delete: false,
  meta: false,
  super: false,
} as const

describe('shouldUseWindowsClipboardPasteFallback', () => {
  test('uses clipboard fallback for ctrl+v on Windows when the terminal did not emit bracketed paste', () => {
    expect(
      shouldUseWindowsClipboardPasteFallback(
        'v',
        CTRL_V_KEY,
        false,
        'windows',
      ),
    ).toBe(true)
  })

  test('skips the fallback when the terminal already emitted a paste event', () => {
    expect(
      shouldUseWindowsClipboardPasteFallback('v', CTRL_V_KEY, true, 'windows'),
    ).toBe(false)
  })

  test('skips the fallback outside Windows', () => {
    expect(
      shouldUseWindowsClipboardPasteFallback('v', CTRL_V_KEY, false, 'macos'),
    ).toBe(false)
  })
})
