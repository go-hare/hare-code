export type HostRole = 'system' | 'user' | 'assistant'

export type HostAttachmentType =
  | 'text'
  | 'image'
  | 'document'
  | 'audio'
  | 'file'
  | 'url'
  | 'binary'
  | 'custom'

export type HostAttachment = {
  type: HostAttachmentType | string
  name?: string
  mimeType?: string
  path?: string
  url?: string
  text?: string
  dataBase64?: string
  metadata?: Record<string, unknown>
}

export type UserInput = {
  text: string
  conversationId?: string
  turnId?: string
  userId?: string
  metadata?: Record<string, unknown>
  attachments?: HostAttachment[]
}

export type HostEvent = {
  eventType: string
  conversationId?: string
  turnId?: string
  role?: HostRole
  text?: string
  metadata?: Record<string, unknown>
  attachments?: HostAttachment[]
}

export type GoalInput = {
  goal: string
  conversationId?: string
  turnId?: string
  source?: string
  priority?: 'low' | 'normal' | 'high'
  metadata?: Record<string, unknown>
}
