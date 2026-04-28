import { describe, expect, test } from 'bun:test'

import { createDefaultKernelRuntimeMcpRegistry } from '../runtimeMcpRegistry.js'
import type { ScopedMcpServerConfig } from '../../services/mcp/types.js'

function createHttpOauthServer(
  scope: ScopedMcpServerConfig['scope'] = 'user',
): ScopedMcpServerConfig {
  return {
    type: 'http',
    url: 'https://example.test/mcp',
    oauth: {
      clientId: 'client-id',
    },
    scope,
  }
}

describe('createDefaultKernelRuntimeMcpRegistry', () => {
  test('returns an authorization URL when callback completion is not provided', async () => {
    const config = createHttpOauthServer()
    const registry = createDefaultKernelRuntimeMcpRegistry(undefined, {
      async getClaudeCodeMcpConfigs() {
        return { servers: { github: config } }
      },
      async isMcpServerDisabled() {
        return false
      },
      async setMcpServerEnabled() {},
      async reconnectMcpServer() {
        throw new Error('reconnect should not run for URL-only auth requests')
      },
      async performOAuthFlow(_serverName, _config, onAuthorizationUrl) {
        onAuthorizationUrl('https://auth.example/authorize')
        const cancelled = new Error('cancelled after authorization URL')
        cancelled.name = 'AuthenticationCancelledError'
        throw cancelled
      },
      async revokeServerTokens() {},
      clearMcpAuthCache() {},
      isAuthFlowCancelled(error) {
        return error instanceof Error && error.name === 'AuthenticationCancelledError'
      },
    })

    const result = await registry.authenticateServer?.({
      serverName: 'github',
      metadata: { source: 'test' },
    })

    expect(result).toMatchObject({
      serverName: 'github',
      state: 'needs-auth',
      authorizationUrl: 'https://auth.example/authorize',
      metadata: { source: 'test' },
      server: {
        name: 'github',
        state: 'needs-auth',
      },
    })
    expect(result?.snapshot?.servers).toEqual([
      expect.objectContaining({
        name: 'github',
        state: 'needs-auth',
      }),
    ])
  })

  test('completes OAuth auth with callback URL and reconnects the server', async () => {
    const config = createHttpOauthServer('project')
    let clearedAuthCache = 0
    let callbackBridgeUsed = false
    const registry = createDefaultKernelRuntimeMcpRegistry(undefined, {
      async getClaudeCodeMcpConfigs() {
        return { servers: { github: config } }
      },
      async isMcpServerDisabled() {
        return false
      },
      async setMcpServerEnabled() {},
      async reconnectMcpServer(serverName, serverConfig) {
        return {
          client: {
            type: 'connected',
            name: serverName,
            config: serverConfig,
            capabilities: {},
            client: {} as never,
            cleanup: async () => {},
          },
        }
      },
      async performOAuthFlow(_serverName, _config, onAuthorizationUrl, _abortSignal, options) {
        onAuthorizationUrl('https://auth.example/authorize')
        options?.onWaitingForCallback?.(callbackUrl => {
          callbackBridgeUsed = callbackUrl === 'https://callback.example/done'
        })
      },
      async revokeServerTokens() {},
      clearMcpAuthCache() {
        clearedAuthCache += 1
      },
      isAuthFlowCancelled() {
        return false
      },
    })

    const result = await registry.authenticateServer?.({
      serverName: 'github',
      callbackUrl: 'https://callback.example/done',
    })

    expect(callbackBridgeUsed).toBe(true)
    expect(clearedAuthCache).toBe(1)
    expect(result).toMatchObject({
      serverName: 'github',
      state: 'connected',
      authorizationUrl: 'https://auth.example/authorize',
      server: {
        name: 'github',
        state: 'connected',
        scope: 'project',
      },
    })
  })

  test('clears stored OAuth state and returns a needs-auth snapshot', async () => {
    const config = createHttpOauthServer()
    let revoked = 0
    let clearedAuthCache = 0
    const registry = createDefaultKernelRuntimeMcpRegistry(undefined, {
      async getClaudeCodeMcpConfigs() {
        return { servers: { github: config } }
      },
      async isMcpServerDisabled() {
        return false
      },
      async setMcpServerEnabled() {},
      async reconnectMcpServer() {
        throw new Error('reconnect should not run for clear auth')
      },
      async performOAuthFlow() {
        throw new Error('auth flow should not run for clear auth')
      },
      async revokeServerTokens() {
        revoked += 1
      },
      clearMcpAuthCache() {
        clearedAuthCache += 1
      },
      isAuthFlowCancelled() {
        return false
      },
    })

    const result = await registry.authenticateServer?.({
      serverName: 'github',
      action: 'clear',
      metadata: { reason: 'reset' },
    })

    expect(revoked).toBe(1)
    expect(clearedAuthCache).toBe(1)
    expect(result).toMatchObject({
      serverName: 'github',
      state: 'needs-auth',
      metadata: { reason: 'reset' },
      server: {
        name: 'github',
        state: 'needs-auth',
      },
    })
  })
})
