import type {
  HostAttachment,
  HostEvent,
  HostRole,
  UserInput,
} from '../types/index.js'

export type RuntimeTurnRecord = {
  conversationId: string
  turnId: string
  text: string
  userId?: string
  metadata: Record<string, unknown>
  attachments: HostAttachment[]
  submittedAt: number
}

export type RuntimeHostEventRecord = {
  conversationId: string
  turnId?: string
  eventType: string
  role: HostRole
  text: string
  metadata: Record<string, unknown>
  attachments: HostAttachment[]
  createdAt: number
}

export type RuntimeConversationState = {
  conversationId: string
  createdAt: number
  updatedAt: number
  lastTurnId?: string
  turns: RuntimeTurnRecord[]
  hostEvents: RuntimeHostEventRecord[]
}

export type NormalizedUserInput = Omit<UserInput, 'metadata' | 'attachments'> & {
  conversationId: string
  turnId: string
  metadata: Record<string, unknown>
  attachments: HostAttachment[]
}

export type NormalizedHostEvent = Omit<HostEvent, 'role' | 'metadata' | 'attachments'> & {
  conversationId: string
  role: HostRole
  metadata: Record<string, unknown>
  attachments: HostAttachment[]
  createdAt: number
}

function createRuntimeId(prefix: string): string {
  const entropy = Math.random().toString(16).slice(2, 10)
  const timestamp = Date.now().toString(16).slice(-8)
  return `${prefix}_${timestamp}${entropy}`.slice(0, prefix.length + 1 + 16)
}

export class SessionManager {
  #conversations = new Map<string, RuntimeConversationState>()
  #activeConversationId: string

  constructor(initialConversationId?: string) {
    this.#activeConversationId =
      initialConversationId && initialConversationId.trim()
        ? initialConversationId.trim()
        : createRuntimeId('conv')
    this.ensureConversation(this.#activeConversationId)
  }

  get activeConversationId(): string {
    return this.#activeConversationId
  }

  ensureConversation(conversationId?: string): RuntimeConversationState {
    const id =
      conversationId && conversationId.trim()
        ? conversationId.trim()
        : this.#activeConversationId
    const existing = this.#conversations.get(id)
    if (existing) {
      return existing
    }
    const now = Date.now()
    const created: RuntimeConversationState = {
      conversationId: id,
      createdAt: now,
      updatedAt: now,
      turns: [],
      hostEvents: [],
    }
    this.#conversations.set(id, created)
    return created
  }

  setActiveConversation(conversationId: string): RuntimeConversationState {
    const state = this.ensureConversation(conversationId)
    this.#activeConversationId = state.conversationId
    return state
  }

  beginTurn(input: UserInput): NormalizedUserInput {
    const conversation = this.setActiveConversation(
      input.conversationId || this.#activeConversationId,
    )
    const turnId = input.turnId && input.turnId.trim()
      ? input.turnId.trim()
      : createRuntimeId('turn')

    const normalized: NormalizedUserInput = {
      ...input,
      conversationId: conversation.conversationId,
      turnId,
      metadata: { ...(input.metadata || {}) },
      attachments: [...(input.attachments || [])],
    }

    const record: RuntimeTurnRecord = {
      conversationId: normalized.conversationId,
      turnId: normalized.turnId,
      text: normalized.text,
      userId: normalized.userId,
      metadata: normalized.metadata,
      attachments: normalized.attachments,
      submittedAt: Date.now(),
    }

    conversation.turns.push(record)
    conversation.lastTurnId = record.turnId
    conversation.updatedAt = record.submittedAt
    return normalized
  }

  recordHostEvent(event: HostEvent): NormalizedHostEvent {
    const conversation = this.setActiveConversation(
      event.conversationId || this.#activeConversationId,
    )
    const normalized: NormalizedHostEvent = {
      ...event,
      conversationId: conversation.conversationId,
      role: event.role || 'system',
      metadata: { ...(event.metadata || {}) },
      attachments: [...(event.attachments || [])],
      createdAt: Date.now(),
    }

    const record: RuntimeHostEventRecord = {
      conversationId: normalized.conversationId,
      turnId: event.turnId || conversation.lastTurnId,
      eventType: normalized.eventType,
      role: normalized.role,
      text: normalized.text || '',
      metadata: normalized.metadata,
      attachments: normalized.attachments,
      createdAt: normalized.createdAt,
    }

    conversation.hostEvents.push(record)
    conversation.updatedAt = record.createdAt
    return normalized
  }

  getConversation(conversationId?: string): RuntimeConversationState | null {
    const id = conversationId || this.#activeConversationId
    return this.#conversations.get(id) ?? null
  }

  listConversations(): RuntimeConversationState[] {
    return [...this.#conversations.values()]
  }
}
