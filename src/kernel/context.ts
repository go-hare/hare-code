import {
  getGitStatus,
  getSystemContext,
  getSystemPromptInjection,
  getUserContext,
  setSystemPromptInjection,
} from '../context.js'

export type KernelContextSnapshot = {
  system: Record<string, string>
  user: Record<string, string>
}

export type KernelContextManager = {
  read(): Promise<KernelContextSnapshot>
  getSystem(): Promise<Record<string, string>>
  getUser(): Promise<Record<string, string>>
  getGitStatus(): Promise<string | null>
  getSystemPromptInjection(): string | null
  setSystemPromptInjection(value: string | null): void
}

export type KernelContextManagerOptions = {
  getSystem?: () => Promise<Record<string, string>>
  getUser?: () => Promise<Record<string, string>>
  getGitStatus?: () => Promise<string | null>
  getSystemPromptInjection?: () => string | null
  setSystemPromptInjection?: (value: string | null) => void
}

export function createKernelContextManager(
  options: KernelContextManagerOptions = {},
): KernelContextManager {
  const readSystem = options.getSystem ?? getSystemContext
  const readUser = options.getUser ?? getUserContext
  const readGitStatus = options.getGitStatus ?? getGitStatus
  const readInjection =
    options.getSystemPromptInjection ?? getSystemPromptInjection
  const writeInjection =
    options.setSystemPromptInjection ?? setSystemPromptInjection

  return {
    async read() {
      const [system, user] = await Promise.all([readSystem(), readUser()])
      return { system, user }
    },
    getSystem: readSystem,
    getUser: readUser,
    getGitStatus: readGitStatus,
    getSystemPromptInjection: readInjection,
    setSystemPromptInjection: writeInjection,
  }
}
