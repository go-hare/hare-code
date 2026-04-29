import type { KernelRuntimeCapabilityIntent } from './capability.js'
import type { RuntimeProviderSelection } from './provider.js'
import type { KernelRuntimeId } from './runtime.js'

export type KernelConversationId = string

export type KernelConversationState =
  | 'created'
  | 'ready'
  | 'running'
  | 'aborting'
  | 'detached'
  | 'disposed'
  | 'failed'

export type KernelConversationScope = {
  runtimeId: KernelRuntimeId
  conversationId: KernelConversationId
  workspacePath: string
  sessionId?: string
  capabilityIntent?: KernelRuntimeCapabilityIntent
  provider?: RuntimeProviderSelection
  metadata?: Record<string, unknown>
}

export type KernelConversationSnapshot = KernelConversationScope & {
  state: KernelConversationState
  activeTurnId?: string
  createdAt: string
  updatedAt: string
}

export interface KernelConversationLifecycle {
  readonly id: KernelConversationId
  readonly state: KernelConversationState
  dispose(reason?: string): Promise<void>
}
