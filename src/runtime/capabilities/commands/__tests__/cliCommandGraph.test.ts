import { describe, expect, test } from 'bun:test'

import {
  getCliCommandGraphNode,
  listCliCommandGraph,
} from '../cliCommandGraph.js'

describe('cli command graph', () => {
  test('includes mcp add as a runtime-owned command', () => {
    const node = getCliCommandGraphNode(['mcp', 'add'])

    expect(node).toMatchObject({
      id: 'mcp.add',
      path: ['mcp', 'add'],
      ownership: 'runtime-capability',
      reuse: 'reuse-with-isolation',
      capability: 'mcp',
    })
    expect(node.description).toContain('Add an MCP server')
    expect(listCliCommandGraph()).toContainEqual(node)
  })
})
