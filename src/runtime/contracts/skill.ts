export type RuntimeSkillSource =
  | 'userSettings'
  | 'projectSettings'
  | 'localSettings'
  | 'policySettings'
  | 'builtin'
  | 'bundled'
  | 'plugin'
  | 'mcp'
  | 'managed'
  | 'unknown'

export type RuntimeSkillContext = 'inline' | 'fork' | 'unknown'

export interface RuntimeSkillDescriptor {
  name: string
  description: string
  source: RuntimeSkillSource
  loadedFrom?: string
  aliases?: readonly string[]
  whenToUse?: string
  version?: string
  userInvocable?: boolean
  modelInvocable: boolean
  context?: RuntimeSkillContext
  agent?: string
  allowedTools?: readonly string[]
  paths?: readonly string[]
  contentLength?: number
  plugin?: {
    name?: string
    repository?: string
  }
}

export interface RuntimeSkillCatalogSnapshot {
  skills: readonly RuntimeSkillDescriptor[]
}

export type RuntimeSkillPromptContextRequest = {
  name: string
  args?: string
  input?: unknown
  metadata?: Record<string, unknown>
}

export type RuntimeSkillPromptContextResult = {
  name: string
  descriptor?: RuntimeSkillDescriptor
  context: RuntimeSkillContext
  content?: string
  messages?: readonly unknown[]
  allowedTools?: readonly string[]
  metadata?: Record<string, unknown>
}
