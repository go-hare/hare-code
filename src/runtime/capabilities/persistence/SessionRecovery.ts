import type { LogOption } from '../../../types/logs.js'
import type { loadConversationForResume as loadConversationForResumeFn } from '../../../utils/conversationRecovery.js'

export type RuntimeRecoveredSession = NonNullable<
  Awaited<ReturnType<typeof loadConversationForResumeFn>>
>

export interface RuntimeSessionRecovery {
  load(
    source?: string | LogOption,
    sourceJsonlFile?: string,
  ): Promise<RuntimeRecoveredSession | null>
  loadBySessionId(sessionId: string): Promise<RuntimeRecoveredSession | null>
}

export function createSessionRecovery(): RuntimeSessionRecovery {
  return {
    async load(source, sourceJsonlFile) {
      const { loadConversationForResume } = await import(
        '../../../utils/conversationRecovery.js'
      )
      return loadConversationForResume(source, sourceJsonlFile)
    },
    async loadBySessionId(sessionId) {
      const { loadConversationForResume } = await import(
        '../../../utils/conversationRecovery.js'
      )
      return loadConversationForResume(sessionId, undefined)
    },
  }
}

export const runtimeSessionRecovery = createSessionRecovery()
