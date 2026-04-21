import type { LogOption } from '../../../types/logs.js'
import {
  createSessionRecovery,
  type RuntimeRecoveredSession,
} from './SessionRecovery.js'
import { createTranscriptStore } from './TranscriptStore.js'

export interface RuntimeSessionPersistenceOwner {
  sessionId: string
  transcriptPath(): Promise<string>
  getLastLog(): Promise<LogOption | null>
  recover(sourceJsonlFile?: string): Promise<RuntimeRecoveredSession | null>
}

export function createSessionPersistenceOwner(
  sessionId: string,
): RuntimeSessionPersistenceOwner {
  const transcriptStore = createTranscriptStore()
  const recovery = createSessionRecovery()

  return {
    sessionId,
    transcriptPath() {
      return transcriptStore.getTranscriptPath(sessionId)
    },
    getLastLog() {
      return transcriptStore.getLastSessionLog(sessionId)
    },
    recover(sourceJsonlFile) {
      return recovery.load(sessionId, sourceJsonlFile)
    },
  }
}
