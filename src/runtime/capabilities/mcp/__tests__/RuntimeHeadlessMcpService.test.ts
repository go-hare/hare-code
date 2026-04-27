import { describe, expect, mock, test } from 'bun:test'

import type { AppState } from '../../../../state/AppStateStore.js'
import type { Tool } from '../../../../Tool.js'
import type { MCPServerConnection } from '../../../../services/mcp/types.js'
import { createRuntimeHeadlessMcpService } from '../RuntimeHeadlessMcpService.js'

function createAppState(clients: MCPServerConnection[] = []): AppState {
  return {
    mcp: {
      clients,
      tools: [],
    },
  } as unknown as AppState
}

function createConnection(name: string): MCPServerConnection {
  return {
    name,
    type: 'connected',
    config: {
      type: 'stdio',
      command: 'echo',
      args: [],
      scope: 'dynamic',
    },
    capabilities: {},
    cleanup: async () => {},
  } as unknown as MCPServerConnection
}

function createTool(name: string): Tool {
  return { name, isEnabled: () => true } as unknown as Tool
}

describe('RuntimeHeadlessMcpService', () => {
  test('tracks dynamic reconnects in the runtime-owned client and tool state', () => {
    const appState = createAppState()
    const service = createRuntimeHeadlessMcpService({
      sdkMcpConfigs: {},
      getAppState: () => appState,
      setAppState: mock(() => {}),
      sendMcpMessage: mock(async (_serverName, message) => message),
    })

    service.replaceDynamicConnection({
      serverName: 'dynamic',
      client: createConnection('dynamic'),
      tools: [createTool('mcp__dynamic__read')],
    })

    expect(service.getDynamicState().clients.map(client => client.name)).toEqual(
      ['dynamic'],
    )
    expect(service.getDynamicState().tools.map(tool => tool.name)).toEqual([
      'mcp__dynamic__read',
    ])
    expect(service.findConfig('dynamic')).toMatchObject({
      scope: 'dynamic',
    })
  })

  test('removes disabled dynamic servers from all runtime-owned dynamic state', () => {
    const service = createRuntimeHeadlessMcpService({
      sdkMcpConfigs: {},
      getAppState: () => createAppState(),
      setAppState: mock(() => {}),
      sendMcpMessage: mock(async (_serverName, message) => message),
    })

    service.replaceDynamicConnection({
      serverName: 'dynamic',
      client: createConnection('dynamic'),
      tools: [
        createTool('mcp__dynamic__read'),
        createTool('mcp__other__read'),
      ],
    })
    service.removeDynamicConnection('dynamic')

    expect(service.getDynamicState().clients).toEqual([])
    expect(service.getDynamicState().tools.map(tool => tool.name)).toEqual([
      'mcp__other__read',
    ])
    expect(service.findConfig('dynamic')).toBeNull()
  })
})
