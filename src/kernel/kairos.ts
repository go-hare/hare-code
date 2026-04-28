import {
  isKairosEnabledCachedOrEnv,
  isKairosRuntimeEnabled,
} from '../assistant/gate.js'
import { TICK_TAG } from '../constants/xml.js'
import {
  getActivationSource,
  getNextTickAt,
  isContextBlocked,
  isProactiveActive,
  isProactivePaused,
  pauseProactive as pauseProactiveMode,
  resumeProactive as resumeProactiveMode,
  shouldTick as shouldProactiveTick,
} from '../proactive/index.js'

export type KernelKairosProactiveState = {
  active: boolean
  paused: boolean
  contextBlocked: boolean
  shouldTick: boolean
  nextTickAt: number | null
  activationSource?: string
}

export type KernelKairosAutonomyCommand = {
  value: unknown
  mode: string
  priority?: 'now' | 'next' | 'later'
  workload?: string
  isMeta?: boolean
  origin?: unknown
  autonomy?: unknown
}

export type KernelKairosStatus = {
  enabled: boolean
  runtimeEnabled: boolean
  proactive?: KernelKairosProactiveState
  suspended: boolean
  pendingEvents: number
  lastTickAt?: string
  suspendedReason?: string
}

export type KernelKairosExternalEvent = {
  type: string
  payload?: unknown
  metadata?: Record<string, unknown>
}

export type KernelKairosTickRequest = {
  reason?: string
  drain?: boolean
  createAutonomyCommands?: boolean
  basePrompt?: string
  rootDir?: string
  currentDir?: string
  workload?: string
  priority?: 'now' | 'next' | 'later'
}

export type KernelKairosEvent =
  | {
      type: 'event_enqueued'
      event: KernelKairosExternalEvent
      status: KernelKairosStatus
    }
  | {
      type: 'tick'
      request?: KernelKairosTickRequest
      drainedEvents: readonly KernelKairosExternalEvent[]
      autonomyCommands?: readonly KernelKairosAutonomyCommand[]
      status: KernelKairosStatus
    }
  | { type: 'suspended'; reason?: string; status: KernelKairosStatus }
  | { type: 'resumed'; reason?: string; status: KernelKairosStatus }

export type KernelKairosRuntime = {
  getStatus(): Promise<KernelKairosStatus>
  enqueueEvent(event: KernelKairosExternalEvent): Promise<void>
  tick(request?: KernelKairosTickRequest): Promise<void>
  suspend(reason?: string): Promise<void>
  resume(reason?: string): Promise<void>
  onEvent(handler: (event: KernelKairosEvent) => void): () => void
}

export type KernelKairosRuntimeOptions = {
  isEnabled?: () => boolean
  isRuntimeEnabled?: () => Promise<boolean>
  getProactiveState?: () => KernelKairosProactiveState
  pauseProactive?: () => void
  resumeProactive?: () => void
  createAutonomyCommands?: (
    request: KernelKairosTickRequest,
  ) => Promise<readonly KernelKairosAutonomyCommand[]>
  now?: () => string
}

type KernelKairosEventInput =
  | {
      type: 'event_enqueued'
      event: KernelKairosExternalEvent
    }
  | {
      type: 'tick'
      request?: KernelKairosTickRequest
      drainedEvents: readonly KernelKairosExternalEvent[]
      autonomyCommands?: readonly KernelKairosAutonomyCommand[]
    }
  | { type: 'suspended'; reason?: string }
  | { type: 'resumed'; reason?: string }

export function createKernelKairosRuntime(
  options: KernelKairosRuntimeOptions = {},
): KernelKairosRuntime {
  const listeners = new Set<(event: KernelKairosEvent) => void>()
  const queue: KernelKairosExternalEvent[] = []
  const isEnabled = options.isEnabled ?? isKairosEnabledCachedOrEnv
  const getRuntimeEnabled = options.isRuntimeEnabled ?? isKairosRuntimeEnabled
  const getProactiveState =
    options.getProactiveState ?? getDefaultProactiveState
  const pauseProactive = options.pauseProactive ?? pauseProactiveMode
  const resumeProactive = options.resumeProactive ?? resumeProactiveMode
  const createAutonomyCommands =
    options.createAutonomyCommands ?? createDefaultAutonomyCommands
  const now = options.now ?? (() => new Date().toISOString())
  let suspendedReason: string | undefined
  let lastTickAt: string | undefined

  async function getStatusSnapshot(): Promise<KernelKairosStatus> {
    return {
      enabled: isEnabled(),
      runtimeEnabled: await getRuntimeEnabled(),
      proactive: getProactiveState(),
      suspended: suspendedReason !== undefined,
      suspendedReason,
      pendingEvents: queue.length,
      lastTickAt,
    }
  }

  async function emit(event: KernelKairosEventInput): Promise<void> {
    const status = await getStatusSnapshot()
    const enriched = { ...event, status } as KernelKairosEvent
    for (const listener of listeners) {
      listener(enriched)
    }
  }

  return {
    async getStatus() {
      return getStatusSnapshot()
    },
    async enqueueEvent(event) {
      queue.push(event)
      await emit({ type: 'event_enqueued', event })
    },
    async tick(request) {
      if (suspendedReason) {
        return
      }
      lastTickAt = now()
      const drainedEvents = request?.drain === false ? [] : queue.splice(0)
      const autonomyCommands =
        request?.createAutonomyCommands === true
          ? await createAutonomyCommands(request)
          : undefined
      await emit({ type: 'tick', request, drainedEvents, autonomyCommands })
    },
    async suspend(reason) {
      suspendedReason = reason || 'manual'
      pauseProactive()
      await emit({ type: 'suspended', reason })
    },
    async resume(reason) {
      suspendedReason = undefined
      resumeProactive()
      await emit({ type: 'resumed', reason })
    },
    onEvent(handler) {
      listeners.add(handler)
      return () => {
        listeners.delete(handler)
      }
    },
  }
}

function getDefaultProactiveState(): KernelKairosProactiveState {
  return {
    active: isProactiveActive(),
    paused: isProactivePaused(),
    contextBlocked: isContextBlocked(),
    shouldTick: shouldProactiveTick(),
    nextTickAt: getNextTickAt(),
    activationSource: getActivationSource(),
  }
}

async function createDefaultAutonomyCommands(
  request: KernelKairosTickRequest,
): Promise<readonly KernelKairosAutonomyCommand[]> {
  const { createProactiveAutonomyCommands } = await import(
    '../utils/autonomyRuns.js'
  )
  return createProactiveAutonomyCommands({
    basePrompt:
      request.basePrompt ??
      `<${TICK_TAG}>${new Date().toLocaleTimeString()}</${TICK_TAG}>`,
    rootDir: request.rootDir,
    currentDir: request.currentDir,
    workload: request.workload,
    priority: request.priority,
  })
}
