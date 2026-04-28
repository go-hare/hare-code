import {
  isKairosEnabledCachedOrEnv,
  isKairosRuntimeEnabled,
} from '../assistant/gate.js'

export type KernelKairosStatus = {
  enabled: boolean
  runtimeEnabled: boolean
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
  const now = options.now ?? (() => new Date().toISOString())
  let suspendedReason: string | undefined
  let lastTickAt: string | undefined

  async function getStatusSnapshot(): Promise<KernelKairosStatus> {
    return {
      enabled: isEnabled(),
      runtimeEnabled: await getRuntimeEnabled(),
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
      await emit({ type: 'tick', request, drainedEvents })
    },
    async suspend(reason) {
      suspendedReason = reason || 'manual'
      await emit({ type: 'suspended', reason })
    },
    async resume(reason) {
      suspendedReason = undefined
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
