import type { KernelConversationId } from './conversation.js'

export type KernelTurnId = string

export type KernelTurnState =
  | 'idle'
  | 'starting'
  | 'running'
  | 'aborting'
  | 'completed'
  | 'failed'
  | 'disposed'

export type KernelTurnScope = {
  conversationId: KernelConversationId
  turnId: KernelTurnId
}

export type KernelTurnRunRequest = KernelTurnScope & {
  prompt: string | readonly unknown[]
  attachments?: readonly unknown[]
  metadata?: Record<string, unknown>
}

export type KernelTurnAbortRequest = KernelTurnScope & {
  reason?: string
  metadata?: Record<string, unknown>
}

export type KernelTurnSnapshot = KernelTurnScope & {
  state: KernelTurnState
  startedAt?: string
  completedAt?: string
  stopReason?: string | null
  error?: unknown
}
