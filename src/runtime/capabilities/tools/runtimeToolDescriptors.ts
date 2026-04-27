import type { Tool, Tools } from '../../../Tool.js'
import type {
  RuntimeToolDescriptor,
  RuntimeToolSafety,
  RuntimeToolSource,
} from '../../contracts/tool.js'

export function toRuntimeToolDescriptors(
  tools: Tools,
): RuntimeToolDescriptor[] {
  return tools
    .map(toRuntimeToolDescriptor)
    .sort((left, right) => left.name.localeCompare(right.name))
}

export function toRuntimeToolDescriptor(tool: Tool): RuntimeToolDescriptor {
  const source = getRuntimeToolSource(tool)
  return {
    name: tool.name,
    description: tool.searchHint ?? tool.name,
    source,
    provenance: getRuntimeToolProvenance(tool, source),
    aliases: tool.aliases,
    inputSchema: tool.inputJSONSchema,
    outputSchema: getJsonSchemaLike(tool, 'outputJSONSchema'),
    safety: getRuntimeToolSafety(tool),
    isConcurrencySafe: callToolBoolean(tool, tool.isConcurrencySafe),
    isDeferred: tool.shouldDefer,
    isMcp: tool.isMcp,
    isOpenWorld: callToolBoolean(tool, tool.isOpenWorld),
    requiresUserInteraction: tool.requiresUserInteraction?.(),
  }
}

function getRuntimeToolProvenance(
  tool: Tool,
  source: RuntimeToolSource,
): RuntimeToolDescriptor['provenance'] {
  if (tool.mcpInfo) {
    return {
      source: 'mcp',
      label: tool.mcpInfo.serverName,
      serverName: tool.mcpInfo.serverName,
      toolName: tool.mcpInfo.toolName,
    }
  }
  return {
    source,
    label: tool.name,
  }
}

function getRuntimeToolSource(tool: Tool): RuntimeToolSource {
  if (tool.mcpInfo || tool.isMcp) {
    return 'mcp'
  }
  return 'builtin'
}

function getRuntimeToolSafety(tool: Tool): RuntimeToolSafety {
  if (callToolBoolean(tool, tool.isDestructive)) {
    return 'destructive'
  }
  if (callToolBoolean(tool, tool.isReadOnly)) {
    return 'read'
  }
  return 'write'
}

function callToolBoolean(
  tool: Tool,
  fn: ((input: Record<string, unknown>) => boolean) | undefined,
): boolean | undefined {
  if (!fn) {
    return undefined
  }
  try {
    return fn.call(tool, {})
  } catch {
    return undefined
  }
}

function getJsonSchemaLike(
  tool: Tool,
  key: 'outputJSONSchema',
): Record<string, unknown> | undefined {
  const value = (tool as unknown as Record<string, unknown>)[key]
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined
}
