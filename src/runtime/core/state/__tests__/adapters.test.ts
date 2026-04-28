import { describe, expect, test } from 'bun:test'
import type { AppState } from 'src/state/AppStateStore.js'
import type { RuntimeExecutionSessionStateProvider } from '../../../contracts/state.js'
import { createExecutionStateProviders } from '../adapters.js'

function createBootstrapStateProviderStub(): RuntimeExecutionSessionStateProvider {
  return {
    runWithState(fn) {
      return fn()
    },
    getSessionIdentity() {
      return {
        sessionId: 'session-test' as never,
        sessionProjectDir: null,
        originalCwd: '/tmp',
        projectRoot: '/tmp',
        cwd: '/tmp',
        isInteractive: false,
        clientType: 'test',
      }
    },
    isSessionPersistenceDisabled() {
      return false
    },
  }
}

describe('createExecutionStateProviders', () => {
  test('requires an injected bootstrap state provider', () => {
    expect(() =>
      createExecutionStateProviders({
        getAppState: () => ({}) as AppState,
        setAppState: () => {},
      } as never),
    ).toThrow()
  })

  test('reuses an injected bootstrap state provider', () => {
    const bootstrapStateProvider = createBootstrapStateProviderStub()

    const providers = createExecutionStateProviders({
      getAppState: () => ({}) as AppState,
      setAppState: () => {},
      bootstrapStateProvider,
    })

    expect(providers.bootstrap).toBe(bootstrapStateProvider)
  })
})
