import type { ToolPermissionContext, Tools } from '../../Tool.js'
import { mergeAndFilterTools } from '../../utils/toolPool.js'
import { assembleToolPool, getMergedTools, getTools } from './core.js'

type BuildCodingToolsOptions = {
  permissionContext: ToolPermissionContext
  mcpTools?: Tools
}

type BuildMergedCodingToolsOptions = BuildCodingToolsOptions & {
  initialTools: Tools
}

export function buildBuiltinCodingTools(
  permissionContext: ToolPermissionContext,
): Tools {
  return getTools(permissionContext)
}

export function buildDefaultCodingTools({
  permissionContext,
  mcpTools = [],
}: BuildCodingToolsOptions): Tools {
  return assembleToolPool(permissionContext, mcpTools)
}

export function buildMergedCodingTools({
  initialTools,
  permissionContext,
  mcpTools = [],
}: BuildMergedCodingToolsOptions): Tools {
  return mergeAndFilterTools(
    initialTools,
    buildDefaultCodingTools({ permissionContext, mcpTools }),
    permissionContext.mode,
  )
}

export function buildAllCodingTools({
  permissionContext,
  mcpTools = [],
}: BuildCodingToolsOptions): Tools {
  return getMergedTools(permissionContext, mcpTools)
}
