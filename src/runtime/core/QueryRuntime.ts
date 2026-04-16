import type {
  AssistantDeltaEvent,
  AssistantDoneEvent,
  RuntimeErrorEvent,
} from '../types/index.js'
import type { NormalizedUserInput } from './SessionManager.js'

export type ActiveRun = {
  runId: string
  conversationId: string
  turnId: string
  input: NormalizedUserInput
  submittedAt: number
  status: 'running' | 'interrupted' | 'completed' | 'failed'
}

function createRunId(): string {
  const entropy = Math.random().toString(16).slice(2, 10)
  const timestamp = Date.now().toString(16).slice(-8)
  return `run_${`${timestamp}${entropy}`.slice(0, 16)}`
}

export class QueryRuntime {
  #runs = new Map<string, ActiveRun>()

  submit(input: NormalizedUserInput): ActiveRun {
    const run: ActiveRun = {
      runId: createRunId(),
      conversationId: input.conversationId,
      turnId: input.turnId,
      input,
      submittedAt: Date.now(),
      status: 'running',
    }
    this.#runs.set(run.runId, run)
    return run
  }

  getActiveRun(runId: string): ActiveRun | null {
    return this.#runs.get(runId) ?? null
  }

  listActiveRuns(): ActiveRun[] {
    return [...this.#runs.values()]
  }

  interrupt(turnId?: string): ActiveRun | null {
    const candidate = turnId
      ? [...this.#runs.values()].find(
          run => run.turnId === turnId && run.status === 'running',
        ) || null
      : [...this.#runs.values()]
          .slice()
          .reverse()
          .find(run => run.status === 'running') || null

    if (!candidate) {
      return null
    }

    candidate.status = 'interrupted'
    return candidate
  }

  appendAssistantDelta(runId: string, text: string): AssistantDeltaEvent | null {
    const run = this.#runs.get(runId)
    if (!run) {
      return null
    }
    return {
      type: 'assistant_delta',
      conversationId: run.conversationId,
      turnId: run.turnId,
      runId,
      text,
    }
  }

  completeTurn(
    runId: string,
    text: string,
    stopReason?: string,
  ): AssistantDoneEvent | null {
    const run = this.#runs.get(runId)
    if (!run) {
      return null
    }
    run.status = 'completed'
    this.#runs.delete(runId)
    return {
      type: 'assistant_done',
      conversationId: run.conversationId,
      turnId: run.turnId,
      runId,
      text,
      stopReason,
    }
  }

  failTurn(runId: string, error: string): RuntimeErrorEvent | null {
    const run = this.#runs.get(runId)
    if (!run) {
      return null
    }
    run.status = 'failed'
    this.#runs.delete(runId)
    return {
      type: 'error',
      conversationId: run.conversationId,
      turnId: run.turnId,
      runId,
      error,
      recoverable: false,
    }
  }

  clear(): void {
    this.#runs.clear()
  }
}
