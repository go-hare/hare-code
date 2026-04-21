import type { ValidationResult } from '../Tool.js'
import { getAgentContext } from '../utils/agentContext.js'
import { isCoordinatorMode } from './coordinatorMode.js'
import {
  acquireFileLock,
  canonicalizeFileLockPath,
} from './fileLockManager.js'

type ValidateCoordinatorWriteAccessInput = {
  filePath: string
  sourceTool: string
}

function validateOwnedFiles(
  filePath: string,
  ownedFiles: readonly string[],
): ValidationResult {
  const targetKey = canonicalizeFileLockPath(filePath)
  const matchesOwnedFile = ownedFiles.some(
    ownedFile => canonicalizeFileLockPath(ownedFile) === targetKey,
  )

  if (matchesOwnedFile) {
    return { result: true }
  }

  return {
    result: false,
    message:
      `[Coordinator] This worker is not assigned to edit "${filePath}". ` +
      `Ask the coordinator to reassign this file or run the change serially.`,
    errorCode: 12,
  }
}

export function validateCoordinatorWriteAccess({
  filePath,
  sourceTool,
}: ValidateCoordinatorWriteAccessInput): ValidationResult {
  if (!isCoordinatorMode()) {
    return { result: true }
  }

  const agentContext = getAgentContext()
  if (!agentContext?.agentId) {
    return { result: true }
  }

  if (agentContext.ownedFiles !== undefined) {
    const ownershipResult = validateOwnedFiles(filePath, agentContext.ownedFiles)
    if (!ownershipResult.result) {
      return ownershipResult
    }
  }

  const lockResult = acquireFileLock(filePath, agentContext.agentId, {
    sourceTool,
  })

  if (lockResult.success) {
    return { result: true }
  }

  const holderAgeSec = (lockResult.conflictAgeMs / 1000).toFixed(1)
  const holderToolSuffix = lockResult.conflict.sourceTool
    ? ` via ${lockResult.conflict.sourceTool}`
    : ''

  return {
    result: false,
    message:
      `[Coordinator] File "${filePath}" is currently locked by worker ` +
      `"${lockResult.conflict.agentId}"${holderToolSuffix} ` +
      `(${holderAgeSec}s). Concurrent writes to the same file are not allowed.`,
    errorCode: 11,
  }
}
