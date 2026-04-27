import type { KernelRuntimeEnvelopeBase } from '../runtime/contracts/events.js'
import type {
  KernelTurnId,
  KernelTurnSnapshot,
} from '../runtime/contracts/turn.js'
import type { KernelWaitForTurnOptions } from './runtime.js'
import type { KernelRuntimeWireClient } from './wireProtocol.js'
import { expectSuccess } from './runtimeEnvelope.js'

export type WaitForTerminalTurnOptions = KernelWaitForTurnOptions & {
  conversationId: string
  turnId: KernelTurnId
}

export function waitForTerminalTurn(
  client: KernelRuntimeWireClient,
  options: WaitForTerminalTurnOptions,
): Promise<KernelTurnSnapshot> {
  const existingAbort = getAbortReason(options.signal)
  if (existingAbort) {
    return Promise.reject(existingAbort)
  }

  return new Promise<KernelTurnSnapshot>((resolve, reject) => {
    let settled = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    let unsubscribe: (() => void) | undefined

    const finish = (
      result: { error: Error } | { snapshot: KernelTurnSnapshot },
    ) => {
      if (settled) {
        return
      }
      settled = true
      if (timeout) {
        clearTimeout(timeout)
      }
      options.signal?.removeEventListener('abort', abortHandler)
      unsubscribe?.()
      if ('error' in result) {
        reject(result.error)
        return
      }
      resolve(result.snapshot)
    }

    const abortHandler = () => {
      finish({
        error: getAbortReason(options.signal) ?? new Error('Turn wait aborted'),
      })
    }

    unsubscribe = client.onEvent(envelope => {
      const snapshot = getTerminalTurnSnapshot(
        envelope,
        options.conversationId,
        options.turnId,
      )
      if (snapshot) {
        finish({ snapshot })
      }
    })
    options.signal?.addEventListener('abort', abortHandler, { once: true })
    if (options.timeoutMs !== undefined) {
      timeout = setTimeout(() => {
        finish({
          error: new Error(`Timed out waiting for turn ${options.turnId}`),
        })
      }, options.timeoutMs)
    }

    client
      .subscribeEvents({
        type: 'subscribe_events',
        conversationId: options.conversationId,
        turnId: options.turnId,
        sinceEventId: options.sinceEventId,
      })
      .then(expectSuccess)
      .catch(error => {
        finish({
          error: error instanceof Error ? error : new Error(String(error)),
        })
      })
  })
}

function getTerminalTurnSnapshot(
  envelope: KernelRuntimeEnvelopeBase,
  conversationId: string,
  turnId: KernelTurnId,
): KernelTurnSnapshot | undefined {
  if (
    envelope.kind !== 'event' ||
    envelope.conversationId !== conversationId ||
    envelope.turnId !== turnId
  ) {
    return undefined
  }
  const payload = envelope.payload
  if (!isRecord(payload)) {
    return undefined
  }
  if (payload.type !== 'turn.completed' && payload.type !== 'turn.failed') {
    return undefined
  }
  const snapshot = payload.payload
  return isKernelTurnSnapshot(snapshot) ? snapshot : undefined
}

function isKernelTurnSnapshot(value: unknown): value is KernelTurnSnapshot {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.conversationId === 'string' &&
    typeof value.turnId === 'string' &&
    (value.state === 'completed' || value.state === 'failed')
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getAbortReason(signal: AbortSignal | undefined): Error | undefined {
  if (!signal?.aborted) {
    return undefined
  }
  if (signal.reason instanceof Error) {
    return signal.reason
  }
  return new Error(
    signal.reason === undefined ? 'Turn wait aborted' : String(signal.reason),
  )
}
