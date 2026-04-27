import type {
  RuntimeSkillContext,
  RuntimeSkillDescriptor,
  RuntimeSkillPromptContextRequest,
  RuntimeSkillPromptContextResult,
  RuntimeSkillSource,
} from '../runtime/contracts/skill.js'
import type { KernelRuntimeWireClient } from './wireProtocol.js'
import { expectPayload } from './runtimeEnvelope.js'

export type KernelSkillContext = RuntimeSkillContext
export type KernelSkillDescriptor = RuntimeSkillDescriptor
export type KernelSkillPromptContextRequest = RuntimeSkillPromptContextRequest
export type KernelSkillPromptContextResult = RuntimeSkillPromptContextResult
export type KernelSkillSource = RuntimeSkillSource

export type KernelSkillFilter = {
  names?: readonly string[]
  source?: RuntimeSkillSource | readonly RuntimeSkillSource[]
  loadedFrom?: string | readonly string[]
  context?: RuntimeSkillContext | readonly RuntimeSkillContext[]
  userInvocable?: boolean
  modelInvocable?: boolean
}

export type KernelRuntimeSkills = {
  list(filter?: KernelSkillFilter): Promise<readonly KernelSkillDescriptor[]>
  get(name: string): Promise<KernelSkillDescriptor | undefined>
  reload(): Promise<readonly KernelSkillDescriptor[]>
  resolveContext(
    nameOrRequest: string | KernelSkillPromptContextRequest,
    options?: Omit<KernelSkillPromptContextRequest, 'name'>,
  ): Promise<KernelSkillPromptContextResult>
}

export function createKernelRuntimeSkillsFacade(
  client: KernelRuntimeWireClient,
): KernelRuntimeSkills {
  async function list(
    filter: KernelSkillFilter = {},
  ): Promise<readonly KernelSkillDescriptor[]> {
    const payload = expectPayload<{ skills?: unknown }>(
      await client.listSkills(),
    )
    return toSkillDescriptors(payload.skills).filter(skill =>
      matchesSkillFilter(skill, filter),
    )
  }

  return {
    list,
    get: async name => (await list()).find(skill => skill.name === name),
    reload: async () => {
      const payload = expectPayload<{ skills?: unknown }>(
        await client.reloadSkills(),
      )
      return toSkillDescriptors(payload.skills)
    },
    resolveContext: async (nameOrRequest, options = {}) => {
      const request =
        typeof nameOrRequest === 'string'
          ? { ...options, name: nameOrRequest }
          : nameOrRequest
      return expectPayload<KernelSkillPromptContextResult>(
        await client.resolveSkillContext(request),
      )
    },
  }
}

function toSkillDescriptors(value: unknown): readonly KernelSkillDescriptor[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter(isSkillDescriptor)
}

function isSkillDescriptor(value: unknown): value is KernelSkillDescriptor {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { name?: unknown }).name === 'string' &&
    typeof (value as { description?: unknown }).description === 'string'
  )
}

function matchesSkillFilter(
  skill: KernelSkillDescriptor,
  filter: KernelSkillFilter,
): boolean {
  if (filter.names && !filter.names.includes(skill.name)) {
    return false
  }
  if (filter.source && !asArray(filter.source).includes(skill.source)) {
    return false
  }
  if (
    filter.loadedFrom &&
    (!skill.loadedFrom ||
      !asArray(filter.loadedFrom).includes(skill.loadedFrom))
  ) {
    return false
  }
  if (
    filter.context &&
    (!skill.context || !asArray(filter.context).includes(skill.context))
  ) {
    return false
  }
  if (
    filter.userInvocable !== undefined &&
    skill.userInvocable !== filter.userInvocable
  ) {
    return false
  }
  if (
    filter.modelInvocable !== undefined &&
    skill.modelInvocable !== filter.modelInvocable
  ) {
    return false
  }
  return true
}

function asArray<T>(value: T | readonly T[]): readonly T[] {
  return Array.isArray(value) ? (value as readonly T[]) : [value as T]
}
