export type RuntimeAgentSource =
  | 'built-in'
  | 'plugin'
  | 'userSettings'
  | 'projectSettings'
  | 'localSettings'
  | 'flagSettings'
  | 'policySettings'
  | 'unknown'

export type RuntimeAgentMcpServerRef = {
  name: string
  inline: boolean
}

export type RuntimeAgentDefinitionError = {
  path: string
  error: string
}

export interface RuntimeAgentDescriptor {
  agentType: string
  whenToUse: string
  source: RuntimeAgentSource
  active: boolean
  filename?: string
  baseDir?: string
  plugin?: string
  color?: string
  model?: string
  effort?: string | number
  permissionMode?: string
  maxTurns?: number
  background?: boolean
  hasInitialPrompt?: boolean
  hasHooks?: boolean
  tools?: readonly string[]
  disallowedTools?: readonly string[]
  skills?: readonly string[]
  mcpServers?: readonly RuntimeAgentMcpServerRef[]
  memory?: 'user' | 'project' | 'local'
  isolation?: 'worktree' | 'remote'
  pendingSnapshotUpdate?: {
    snapshotTimestamp: string
  }
}

export interface RuntimeAgentRegistrySnapshot {
  activeAgents: readonly RuntimeAgentDescriptor[]
  allAgents: readonly RuntimeAgentDescriptor[]
  failedFiles?: readonly RuntimeAgentDefinitionError[]
  allowedAgentTypes?: readonly string[]
}

export interface RuntimeAgentSpawnRequest {
  agentType?: string
  prompt: string
  description?: string
  model?: string
  runInBackground?: boolean
  taskId?: string
  taskListId?: string
  ownedFiles?: readonly string[]
  name?: string
  teamName?: string
  mode?: string
  isolation?: 'worktree' | 'remote'
  cwd?: string
  metadata?: Record<string, unknown>
}

export interface RuntimeAgentSpawnResult {
  status:
    | 'accepted'
    | 'async_launched'
    | 'completed'
    | 'teammate_spawned'
    | 'remote_launched'
  prompt: string
  runId?: string
  agentType?: string
  agentId?: string
  taskId?: string
  taskListId?: string
  backgroundTaskId?: string
  outputFile?: string
  description?: string
  isAsync?: boolean
  canReadOutputFile?: boolean
  taskLinkingWarning?: string
  message?: string
  run?: RuntimeAgentRunDescriptor
  metadata?: Record<string, unknown>
}

export type RuntimeAgentRunStatus =
  | 'accepted'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type RuntimeAgentRunError = {
  message: string
  code?: string
  details?: Record<string, unknown>
}

export interface RuntimeAgentRunDescriptor {
  runId: string
  status: RuntimeAgentRunStatus
  prompt: string
  createdAt: string
  updatedAt: string
  agentType?: string
  agentId?: string
  description?: string
  model?: string
  taskId?: string
  taskListId?: string
  backgroundTaskId?: string
  outputFile?: string
  outputAvailable?: boolean
  result?: unknown
  error?: RuntimeAgentRunError
  startedAt?: string
  completedAt?: string
  cancelledAt?: string
  cancelReason?: string
  runInBackground?: boolean
  canReadOutputFile?: boolean
  ownedFiles?: readonly string[]
  name?: string
  teamName?: string
  mode?: string
  isolation?: 'worktree' | 'remote'
  cwd?: string
  metadata?: Record<string, unknown>
}

export interface RuntimeAgentRunListSnapshot {
  runs: readonly RuntimeAgentRunDescriptor[]
}

export interface RuntimeAgentRunQuery {
  runId: string
}

export interface RuntimeAgentRunOutputRequest {
  runId: string
  tailBytes?: number
}

export interface RuntimeAgentRunOutput {
  runId: string
  available: boolean
  status?: RuntimeAgentRunStatus
  output?: string
  outputFile?: string
  truncated?: boolean
}

export interface RuntimeAgentRunCancelRequest {
  runId: string
  reason?: string
}

export interface RuntimeAgentRunCancelResult {
  runId: string
  cancelled: boolean
  status?: RuntimeAgentRunStatus
  reason?: string
  message?: string
  run?: RuntimeAgentRunDescriptor | null
}
