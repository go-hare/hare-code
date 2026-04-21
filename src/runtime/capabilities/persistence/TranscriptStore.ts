import type { UUID } from 'crypto'
import type { LogOption } from '../../../types/logs.js'
import type { Message } from '../../../types/message.js'

export interface RuntimeTranscriptStore {
  recordCurrentSession(messages: Message[]): Promise<void>
  flushCurrentSession(): Promise<void>
  getLastSessionLog(sessionId: string): Promise<LogOption | null>
  getTranscriptPath(sessionId: string): Promise<string>
}

export function createTranscriptStore(): RuntimeTranscriptStore {
  return {
    async recordCurrentSession(messages) {
      const { recordTranscript } = await import(
        '../../../utils/sessionStorage.js'
      )
      await recordTranscript(messages)
    },
    async flushCurrentSession() {
      const { flushSessionStorage } = await import(
        '../../../utils/sessionStorage.js'
      )
      return flushSessionStorage()
    },
    async getLastSessionLog(sessionId) {
      const { getLastSessionLog } = await import(
        '../../../utils/sessionStorage.js'
      )
      return getLastSessionLog(sessionId as UUID)
    },
    async getTranscriptPath(sessionId) {
      const { getTranscriptPathForSession } = await import(
        '../../../utils/sessionStorage.js'
      )
      return getTranscriptPathForSession(sessionId as UUID)
    },
  }
}

export const runtimeTranscriptStore = createTranscriptStore()
