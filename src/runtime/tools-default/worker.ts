import type { Tools } from '../../Tool.js'
import { filterToolsForAgent } from '../../tools/AgentTool/agentToolUtils.js'
import type { PermissionMode } from '../../utils/permissions/PermissionMode.js'

type BuildWorkerToolsOptions = {
  tools: Tools
  isBuiltIn: boolean
  isAsync?: boolean
  permissionMode?: PermissionMode
}

export function buildWorkerTools({
  tools,
  isBuiltIn,
  isAsync = false,
  permissionMode,
}: BuildWorkerToolsOptions): Tools {
  return filterToolsForAgent({
    tools,
    isBuiltIn,
    isAsync,
    permissionMode,
  })
}
