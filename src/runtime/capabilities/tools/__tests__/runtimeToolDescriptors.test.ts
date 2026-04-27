import { describe, expect, test } from 'bun:test'

import type { Tool } from '../../../../Tool.js'
import {
  toRuntimeToolDescriptor,
  toRuntimeToolDescriptors,
} from '../runtimeToolDescriptors.js'

describe('runtime tool descriptors', () => {
  test('projects builtin and MCP tools into stable public descriptors', () => {
    const readTool = createTool({
      name: 'Read',
      aliases: ['View'],
      searchHint: 'read local files',
      inputJSONSchema: {
        type: 'object',
        properties: { file_path: { type: 'string' } },
      },
      outputJSONSchema: {
        type: 'object',
        properties: { content: { type: 'string' } },
      },
      isConcurrencySafe: () => true,
      isReadOnly: () => true,
    })
    const bashTool = createTool({
      name: 'Bash',
      isConcurrencySafe: () => false,
      isReadOnly: () => false,
    })
    const deleteTool = createTool({
      name: 'Delete',
      isDestructive: () => true,
      isReadOnly: () => false,
    })
    const mcpTool = createTool({
      name: 'mcp__fs__read',
      isMcp: true,
      mcpInfo: { serverName: 'fs', toolName: 'read' },
      shouldDefer: true,
      isOpenWorld: () => true,
      requiresUserInteraction: () => true,
    })

    expect(toRuntimeToolDescriptor(readTool)).toMatchObject({
      name: 'Read',
      description: 'read local files',
      source: 'builtin',
      provenance: { source: 'builtin', label: 'Read' },
      aliases: ['View'],
      inputSchema: {
        type: 'object',
        properties: { file_path: { type: 'string' } },
      },
      outputSchema: {
        type: 'object',
        properties: { content: { type: 'string' } },
      },
      safety: 'read',
      isConcurrencySafe: true,
    })
    expect(toRuntimeToolDescriptor(bashTool)).toMatchObject({
      name: 'Bash',
      safety: 'write',
      isConcurrencySafe: false,
    })
    expect(toRuntimeToolDescriptor(deleteTool)).toMatchObject({
      name: 'Delete',
      safety: 'destructive',
    })
    expect(toRuntimeToolDescriptor(mcpTool)).toMatchObject({
      name: 'mcp__fs__read',
      source: 'mcp',
      provenance: {
        source: 'mcp',
        label: 'fs',
        serverName: 'fs',
        toolName: 'read',
      },
      isDeferred: true,
      isMcp: true,
      isOpenWorld: true,
      requiresUserInteraction: true,
    })
    expect(
      toRuntimeToolDescriptors([mcpTool, readTool, bashTool]).map(
        descriptor => descriptor.name,
      ),
    ).toEqual(['Bash', 'mcp__fs__read', 'Read'])
  })
})

function createTool(
  tool: Partial<Tool> & {
    name: string
    outputJSONSchema?: Record<string, unknown>
  },
): Tool {
  return {
    maxResultSizeChars: 1_000,
    isConcurrencySafe: () => true,
    isEnabled: () => true,
    isReadOnly: () => false,
    userFacingName: () => tool.name,
    ...tool,
  } as Tool
}
