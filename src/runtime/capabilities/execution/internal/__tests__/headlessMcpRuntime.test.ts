import { describe, expect, test } from 'bun:test'
import { buildMcpServerStatusesRuntime } from '../headlessMcpRuntime.js'

describe('buildMcpServerStatusesRuntime', () => {
  test('combines app, sdk, and dynamic MCP server state without duplicate names', () => {
    const statuses = buildMcpServerStatusesRuntime({
      appState: {
        mcp: {
          clients: [
            {
              name: 'project',
              type: 'connected',
              serverInfo: { name: 'project-server', version: '1.0.0' },
              capabilities: {},
              config: {
                type: 'stdio',
                command: 'node',
                args: ['server.js'],
                scope: 'project',
              },
            },
          ] as never,
          tools: [
            {
              name: 'mcp__project__search',
              mcpInfo: { serverName: 'project', toolName: 'search' },
              isReadOnly: () => true,
            },
          ] as never,
        },
      } as never,
      sdkClients: [
        {
          name: 'sdk',
          type: 'failed',
          error: 'boom',
          config: {
            type: 'stdio',
            command: 'node',
            args: ['sdk.js'],
            scope: 'dynamic',
          },
        },
      ] as never,
      dynamicMcpState: {
        clients: [
          {
            name: 'project',
            type: 'connected',
            serverInfo: { name: 'duplicate-project', version: '1.0.0' },
            capabilities: {},
            config: {
              type: 'stdio',
              command: 'node',
              args: ['duplicate.js'],
              scope: 'dynamic',
            },
          },
          {
            name: 'dynamic',
            type: 'connected',
            serverInfo: { name: 'dynamic-server', version: '1.0.0' },
            capabilities: {},
            config: {
              type: 'stdio',
              command: 'node',
              args: ['dynamic.js'],
              scope: 'dynamic',
            },
          },
        ] as never,
        tools: [
          {
            name: 'mcp__dynamic__list',
            mcpInfo: { serverName: 'dynamic', toolName: 'list' },
            isReadOnly: () => false,
            isDestructive: () => false,
            isOpenWorld: () => false,
          },
        ] as never,
        configs: {},
      } as never,
    })

    expect(statuses.map(status => status.name)).toEqual([
      'project',
      'sdk',
      'dynamic',
    ])
    expect(statuses[0]?.tools).toEqual([
      {
        name: 'search',
        annotations: {
          readOnly: true,
          destructive: undefined,
          openWorld: undefined,
        },
      },
    ])
    expect(statuses[1]?.error).toBe('boom')
    expect(statuses[2]?.tools).toEqual([
      {
        name: 'list',
        annotations: {
          readOnly: undefined,
          destructive: undefined,
          openWorld: undefined,
        },
      },
    ])
  })
})
