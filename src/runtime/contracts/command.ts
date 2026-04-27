import type { RuntimeHostContext } from './host.js'
import type { RuntimePermissionMode } from './permissions.js'

export type RuntimeCommandKind = 'prompt' | 'local' | 'local-jsx' | 'workflow'

export type RuntimeCommandDisplay = 'skip' | 'system' | 'user'

export interface RuntimeCommandDescriptor {
  name: string
  description: string
  kind: RuntimeCommandKind
  aliases?: readonly string[]
  availability?: readonly string[]
  argumentHint?: string
  bridgeSafe?: boolean
  disableModelInvocation?: boolean
  hidden?: boolean
  immediate?: boolean
  sensitive?: boolean
  terminalOnly?: boolean
  whenToUse?: string
}

export interface RuntimeCommandGraphEntry {
  descriptor: RuntimeCommandDescriptor
  source?: string
  loadedFrom?: string
  supportsNonInteractive: boolean
  modelInvocable: boolean
}

export type RuntimeCommandInvocation = {
  name: string
  args: string
  source: 'cli' | 'repl' | 'bridge' | 'daemon' | 'sdk' | 'test'
}

export type RuntimeCommandExecuteRequest = {
  name: string
  args?: string
  source?: RuntimeCommandInvocation['source']
  metadata?: Record<string, unknown>
}

export interface RuntimeCommandContext {
  sessionId: string
  cwd: string
  host: RuntimeHostContext
  permissionMode: RuntimePermissionMode
}

export type RuntimeCommandResult =
  | { type: 'skip' }
  | {
      type: 'text'
      text: string
      display?: RuntimeCommandDisplay
    }
  | {
      type: 'query'
      prompt?: string
      text?: string
      metaMessages?: readonly string[]
      nextInput?: string
      submitNextInput?: boolean
    }
  | {
      type: 'compact'
      text?: string
      metaMessages?: readonly string[]
    }

export type RuntimeCommandExecutionResult = {
  name: string
  kind?: RuntimeCommandKind
  result: RuntimeCommandResult
  metadata?: Record<string, unknown>
}

export interface RuntimeCommandHandler {
  readonly descriptor: RuntimeCommandDescriptor
  invoke(
    invocation: RuntimeCommandInvocation,
    context: RuntimeCommandContext,
  ): Promise<RuntimeCommandResult>
}

export interface RuntimeCommandResolver {
  list(): readonly RuntimeCommandDescriptor[]
  resolve(name: string): RuntimeCommandHandler | undefined
}
