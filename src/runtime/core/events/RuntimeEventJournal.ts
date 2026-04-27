import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { dirname } from 'path'

import type {
  KernelEvent,
  KernelRuntimeEnvelopeBase,
} from '../../contracts/events.js'

const DEFAULT_MAX_REPLAY_EVENTS = 512

type JsonRecord = Record<string, unknown>

export class RuntimeEventFileJournal {
  private readonly maxReplayEvents: number

  constructor(
    private readonly path: string,
    maxReplayEvents = DEFAULT_MAX_REPLAY_EVENTS,
  ) {
    this.maxReplayEvents = Math.max(0, Math.floor(maxReplayEvents))
  }

  readReplayableEnvelopes(): Array<KernelRuntimeEnvelopeBase<KernelEvent>> {
    if (!existsSync(this.path) || this.maxReplayEvents === 0) {
      return []
    }

    const envelopes: Array<KernelRuntimeEnvelopeBase<KernelEvent>> = []
    const lines = readFileSync(this.path, 'utf8')
      .split(/\r?\n/)
      .filter(line => line.trim().length > 0)

    for (const line of lines) {
      const envelope = parseJournalLine(line)
      if (envelope) {
        envelopes.push(envelope)
      }
    }

    return envelopes.slice(-this.maxReplayEvents)
  }

  append(envelope: KernelRuntimeEnvelopeBase): void {
    if (!isReplayableEventEnvelope(envelope)) {
      return
    }

    mkdirSync(dirname(this.path), { recursive: true })
    appendFileSync(this.path, `${JSON.stringify(envelope)}\n`, 'utf8')
  }
}

function parseJournalLine(
  line: string,
): KernelRuntimeEnvelopeBase<KernelEvent> | undefined {
  try {
    const parsed = JSON.parse(line) as unknown
    if (isReplayableEventEnvelope(parsed)) {
      return parsed
    }
  } catch {
    return undefined
  }
  return undefined
}

function isReplayableEventEnvelope(
  value: unknown,
): value is KernelRuntimeEnvelopeBase<KernelEvent> {
  if (!isRecord(value)) {
    return false
  }
  const payload = value.payload
  return (
    value.schemaVersion === 'kernel.runtime.v1' &&
    value.kind === 'event' &&
    value.source === 'kernel_runtime' &&
    typeof value.messageId === 'string' &&
    typeof value.sequence === 'number' &&
    typeof value.timestamp === 'string' &&
    typeof value.eventId === 'string' &&
    isRecord(payload) &&
    payload.replayable === true
  )
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
