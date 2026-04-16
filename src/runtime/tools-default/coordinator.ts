import type { Tools } from '../../Tool.js'
import { applyCoordinatorToolFilter } from '../../utils/toolPool.js'

export function buildCoordinatorTools(tools: Tools): Tools {
  return applyCoordinatorToolFilter(tools)
}
