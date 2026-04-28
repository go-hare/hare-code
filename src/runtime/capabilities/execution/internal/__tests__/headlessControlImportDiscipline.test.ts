import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const headlessControlContent = readFileSync(
  join(import.meta.dir, '../headlessControl.ts'),
  'utf8',
)
const headlessSessionControlContent = readFileSync(
  join(import.meta.dir, '../headlessSessionControl.ts'),
  'utf8',
)
const headlessSessionContent = readFileSync(
  join(import.meta.dir, '../headlessSession.ts'),
  'utf8',
)
const headlessRuntimeLoopContent = readFileSync(
  join(import.meta.dir, '../headlessRuntimeLoop.ts'),
  'utf8',
)

describe('headless control import discipline', () => {
  test('headlessControl does not import bootstrap state directly for headless control state', () => {
    expect(headlessControlContent).not.toContain(
      "from 'src/bootstrap/state.js'",
    )
    expect(headlessControlContent).not.toContain('getMainThreadAgentType,')
    expect(headlessControlContent).not.toContain('setMainThreadAgentType,')
    expect(headlessControlContent).not.toContain('setInitJsonSchema,')
    expect(headlessControlContent).not.toContain('setMainLoopModelOverride,')
    expect(headlessControlContent).not.toContain('getSessionId,')
    expect(headlessControlContent).not.toContain('registerHookCallbacks,')
    expect(headlessControlContent).toContain(
      'bootstrapStateProvider.getHeadlessControlState()',
    )
    expect(headlessControlContent).toContain(
      'bootstrapStateProvider.patchHeadlessControlState({',
    )
    expect(headlessControlContent).toContain(
      'bootstrapStateProvider.patchPromptState({',
    )
    expect(headlessControlContent).toContain(
      'bootstrapStateProvider.registerHookCallbacks(hooks)',
    )
  })

  test('headlessSessionControl reads allowed channels through the runtime provider seam', () => {
    expect(headlessSessionControlContent).not.toContain(
      "from 'src/bootstrap/state.js'",
    )
    expect(headlessSessionControlContent).not.toContain(
      'RuntimeBootstrapStateProvider',
    )
    expect(headlessSessionControlContent).not.toContain(
      "from '../../server/SessionRegistry.js'",
    )
    expect(headlessSessionControlContent).toContain(
      "from '../../../core/session/RuntimeSessionRegistry.js'",
    )
    expect(headlessSessionControlContent).toContain(
      'HeadlessSessionStateProvider',
    )
    expect(headlessSessionControlContent).toContain(
      'bootstrapStateProvider.getHeadlessControlState().allowedChannels',
    )
    expect(headlessSessionControlContent).toContain(
      'bootstrapStateProvider.patchHeadlessControlState({',
    )
  })

  test('headlessSession keeps the wrapper seam scoped to the runtime headless provider', () => {
    expect(headlessSessionContent).not.toContain(
      'RuntimeBootstrapStateProvider',
    )
    expect(headlessSessionContent).toContain(
      'HeadlessSessionStateProvider',
    )
    expect(headlessSessionContent).toContain(
      'createHeadlessSessionContext(bootstrapStateProvider)',
    )
  })

  test('headlessRuntimeLoop accepts the narrowed headless session provider', () => {
    expect(headlessRuntimeLoopContent).not.toContain(
      'RuntimeBootstrapStateProvider',
    )
    expect(headlessRuntimeLoopContent).toContain(
      'bootstrapStateProvider: HeadlessSessionStateProvider',
    )
    expect(headlessRuntimeLoopContent).toContain(
      'bootstrapStateProvider: session.bootstrapStateProvider,',
    )
  })
})
