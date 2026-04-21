import type { Command } from '../../../commands.js'
import type {
  ConnectedMCPServer,
  MCPServerConnection,
  ScopedMcpServerConfig,
  ServerResource,
} from '../../../services/mcp/types.js'
import { toolMatchesName, type Tool } from '../../../Tool.js'

export type McpBoundConnection = {
  client: MCPServerConnection
  tools: Tool[]
  commands: Command[]
  resources?: ServerResource[]
}

type ResourceToolBindingMode = 'once-per-session' | 'per-resource-server'

export function createMcpTransportBinding(deps: {
  getSessionId: () => string
  getOriginalCwd: () => string
}): {
  getRequestHeaders(): Record<string, string>
  getRoots(): { roots: [{ uri: string }] }
} {
  return {
    getRequestHeaders() {
      return {
        'X-Mcp-Client-Session-Id': deps.getSessionId(),
      }
    },
    getRoots() {
      return {
        roots: [
          {
            uri: `file://${deps.getOriginalCwd()}`,
          },
        ],
      }
    },
  }
}

function normalizeResources(
  resources?: ServerResource[],
): ServerResource[] | undefined {
  return resources && resources.length > 0 ? resources : undefined
}

function hasBoundResourceTools(
  tools: Tool[],
  resourceTools: readonly Tool[],
): boolean {
  return resourceTools.some(resourceTool =>
    tools.some(tool => toolMatchesName(tool, resourceTool.name)),
  )
}

export function createMcpConnectionBinding(
  resourceTools: readonly Tool[],
): {
  bindNeedsAuth(
    name: string,
    config: ScopedMcpServerConfig,
    authTool: Tool,
  ): McpBoundConnection
  bindConnectedServer(input: {
    client: ConnectedMCPServer
    tools: Tool[]
    commands: Command[]
    resources?: ServerResource[]
    mode: ResourceToolBindingMode
  }): McpBoundConnection
} {
  let resourceToolsAdded = false

  return {
    bindNeedsAuth(name, config, authTool) {
      return {
        client: { name, type: 'needs-auth', config },
        tools: [authTool],
        commands: [],
      }
    },
    bindConnectedServer({ client, tools, commands, resources, mode }) {
      const supportsResources = !!client.capabilities?.resources
      const boundTools = [...tools]

      if (supportsResources) {
        const shouldAddResourceTools =
          mode === 'once-per-session'
            ? !resourceToolsAdded
            : !hasBoundResourceTools(boundTools, resourceTools)

        if (shouldAddResourceTools) {
          boundTools.push(...resourceTools)
          resourceToolsAdded = true
        }
      }

      return {
        client,
        tools: boundTools,
        commands,
        resources: normalizeResources(resources),
      }
    },
  }
}
