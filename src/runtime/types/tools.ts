import type { HostAttachment } from './input.js'

export type ToolExecutionMode = 'in_process' | 'host_resolved'

export type ToolDefinition = {
  name: string
  description: string
  parameters: Record<string, unknown>
  executionMode?: ToolExecutionMode
  isReadOnly?: boolean
  isConcurrencySafe?: boolean
  metadata?: Record<string, unknown>
}

export type ToolCall = {
  toolUseId: string
  toolName: string
  toolInput: Record<string, unknown>
  conversationId?: string
  turnId?: string
  runId?: string
  metadata?: Record<string, unknown>
}

export type ToolResultContent =
  | string
  | Array<{
      type: string
      text?: string
      source?: Record<string, unknown>
      metadata?: Record<string, unknown>
    }>

export type ToolResult = {
  toolUseId: string
  content?: ToolResultContent
  text?: string
  isError?: boolean
  attachments?: HostAttachment[]
  metadata?: Record<string, unknown>
}

export type PendingToolCall = {
  runId: string
  calls: ToolCall[]
}
