export type RuntimeTranscriptRecord = {
  sessionId: string
  projectDir?: string | null
  messages: readonly unknown[]
}

export type RuntimeSessionSnapshot = {
  sessionId: string
  projectDir: string | null
  cwd: string
  createdAt: number
  state?: Record<string, unknown>
}

export type RuntimeRecoveryRequest = {
  sessionId: string
  projectDir?: string | null
  source?: 'resume' | 'teleport' | 'restore' | 'test'
}

export interface RuntimePersistenceStore {
  appendTranscript(record: RuntimeTranscriptRecord): Promise<void>
  flush?(): Promise<void>
  saveSnapshot(snapshot: RuntimeSessionSnapshot): Promise<void>
  loadSnapshot(
    request: RuntimeRecoveryRequest,
  ): Promise<RuntimeSessionSnapshot | null>
  restoreTranscript(
    request: RuntimeRecoveryRequest,
  ): Promise<RuntimeTranscriptRecord | null>
}
