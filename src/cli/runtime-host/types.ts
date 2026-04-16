import type { RuntimeEvent, RuntimeState, TaskState } from '../../runtime/types/index.js'

export type CliRuntimeNotification = {
  key: string
  text: string
  priority: 'low' | 'medium' | 'high' | 'immediate'
  level: 'info' | 'warning' | 'error'
  createdAt: number
  metadata?: Record<string, unknown>
}

export type CliRuntimeEventLogEntry = {
  id: string
  receivedAt: number
  event: RuntimeEvent
}

export type CliRuntimeHostViewState = {
  runtime: RuntimeState
  tasks: Record<string, TaskState>
  notifications: CliRuntimeNotification[]
  recentEvents: CliRuntimeEventLogEntry[]
  activeAssistantTextByRunId: Record<string, string>
  latestAssistantText?: string
  lastError?: string
}

export type CliRuntimeHostAdapterOptions = {
  maxNotifications?: number
  maxRecentEvents?: number
}

export type CliRuntimeHostResolvedOptions = {
  maxNotifications: number
  maxRecentEvents: number
}

export type CliRuntimeHostListener = (state: CliRuntimeHostViewState) => void
