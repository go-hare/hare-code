import type { Message } from 'src/types/message.js'
import { createAbortController } from 'src/utils/abortController.js'
import {
  createFileStateCacheWithSizeLimit,
  mergeFileStateCaches,
  READ_FILE_STATE_CACHE_SIZE,
  type FileState,
  type FileStateCache,
} from 'src/utils/fileStateCache.js'
import { extractReadFilesFromMessages } from 'src/utils/queryHelpers.js'

export type HeadlessManagedSession = {
  readonly messages: Message[]
  startTurn(): AbortController
  getAbortController(): AbortController | undefined
  abortActiveTurn(reason?: unknown): void
  getCommittedReadFileState(): FileStateCache
  getReadFileCache(): FileStateCache
  commitReadFileCache(cache: FileStateCache): void
  seedReadFileState(path: string, fileState: FileState): void
}

export function createHeadlessManagedSession(
  initialMessages: Message[],
  cwd: string,
): HeadlessManagedSession {
  let abortController: AbortController | undefined
  let readFileState = extractReadFilesFromMessages(
    initialMessages,
    cwd,
    READ_FILE_STATE_CACHE_SIZE,
  )
  const pendingSeeds = createFileStateCacheWithSizeLimit(
    READ_FILE_STATE_CACHE_SIZE,
  )

  return {
    messages: initialMessages,
    startTurn() {
      abortController = createAbortController()
      return abortController
    },
    getAbortController() {
      return abortController
    },
    abortActiveTurn(reason) {
      abortController?.abort(reason)
    },
    getCommittedReadFileState() {
      return readFileState
    },
    getReadFileCache() {
      return pendingSeeds.size === 0
        ? readFileState
        : mergeFileStateCaches(readFileState, pendingSeeds)
    },
    commitReadFileCache(cache) {
      readFileState = cache
      for (const [path, seed] of pendingSeeds.entries()) {
        const existing = readFileState.get(path)
        if (!existing || seed.timestamp > existing.timestamp) {
          readFileState.set(path, seed)
        }
      }
      pendingSeeds.clear()
    },
    seedReadFileState(path, fileState) {
      pendingSeeds.set(path, fileState)
    },
  }
}
