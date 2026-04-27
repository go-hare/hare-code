import { describe, expect, test } from 'bun:test'
import { spawn } from 'child_process'
import { existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION } from '../../src/kernel/wireProtocol.js'

const repoRoot = join(import.meta.dir, '../..')

type WireEnvelope = {
  kind: string
  requestId?: string
  eventId?: string
  conversationId?: string
  turnId?: string
  payload?: {
    type?: string
    state?: string
    activeTurnId?: string
    payload?: Record<string, unknown>
  }
  error?: {
    code: string
    message?: string
    retryable?: boolean
    details?: Record<string, unknown>
  }
}

type RuntimeHarness = {
  child: ReturnType<typeof spawn>
  stderr: string[]
  envelopes: WireEnvelope[]
  waiters: Set<() => void>
}

type ExitResult = {
  code: number | null
  signal: NodeJS.Signals | null
}

function command(input: Record<string, unknown>): string {
  return `${JSON.stringify({
    schemaVersion: KERNEL_RUNTIME_COMMAND_SCHEMA_VERSION,
    ...input,
  })}\n`
}

describe('kernel runtime wire crash recovery', () => {
  test(
    'replays events and restores active conversation snapshots after a hard kill',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'kernel-runtime-crash-journal-'))
      const journalPath = join(dir, 'events.ndjson')
      const conversationJournalPath = join(dir, 'conversations.ndjson')
      let first: RuntimeHarness | undefined
      let second: RuntimeHarness | undefined

      try {
        first = startRuntime(journalPath, conversationJournalPath)
        first.child.stdin.write(
          command({
            type: 'create_conversation',
            requestId: 'create-1',
            conversationId: 'conversation-1',
            workspacePath: repoRoot,
          }),
        )
        const ready = await waitForEnvelope(
          first.envelopes,
          first.waiters,
          envelope => envelope.payload?.type === 'conversation.ready',
        )

        first.child.stdin.write(
          command({
            type: 'run_turn',
            requestId: 'run-1',
            conversationId: 'conversation-1',
            turnId: 'turn-1',
            prompt: 'hello crash recovery',
          }),
        )
        await waitForEnvelope(
          first.envelopes,
          first.waiters,
          envelope => envelope.payload?.type === 'turn.started',
        )
        await waitForEnvelope(
          first.envelopes,
          first.waiters,
          envelope => envelope.kind === 'ack' && envelope.requestId === 'run-1',
        )

        const killedExit = await stopRuntime(first, 'kill')
        expect(killedExit).toEqual({
          code: null,
          signal: 'SIGKILL',
        })
        expect(first.stderr.join('')).toBe('')

        second = startRuntime(journalPath, conversationJournalPath)
        second.child.stdin.write(
          command({
            type: 'subscribe_events',
            requestId: 'subscribe-1',
            conversationId: 'conversation-1',
            sinceEventId: ready.eventId,
          }),
        )
        await waitForEnvelope(
          second.envelopes,
          second.waiters,
          envelope =>
            envelope.kind === 'ack' && envelope.requestId === 'subscribe-1',
        )
        const replayed = await waitForEnvelope(
          second.envelopes,
          second.waiters,
          envelope => envelope.payload?.type === 'turn.started',
        )
        expect(replayed).toMatchObject({
          kind: 'event',
          conversationId: 'conversation-1',
          turnId: 'turn-1',
          payload: {
            type: 'turn.started',
          },
        })

        second.child.stdin.write(
          command({
            type: 'create_conversation',
            requestId: 'create-2',
            conversationId: 'conversation-1',
            workspacePath: repoRoot,
          }),
        )
        const recreated = await waitForEnvelope(
          second.envelopes,
          second.waiters,
          envelope =>
            envelope.kind === 'ack' && envelope.requestId === 'create-2',
        )
        expect(recreated).toMatchObject({
          kind: 'ack',
          requestId: 'create-2',
          conversationId: 'conversation-1',
          payload: {
            state: 'detached',
            activeTurnId: 'turn-1',
          },
        })
        await waitForEnvelope(
          second.envelopes,
          second.waiters,
          envelope => envelope.payload?.type === 'conversation.recovered',
        )

        second.child.stdin.write(
          command({
            type: 'run_turn',
            requestId: 'run-after-crash',
            conversationId: 'conversation-1',
            turnId: 'turn-2',
            prompt: 'resume previous turn',
          }),
        )
        const busy = await waitForEnvelope(
          second.envelopes,
          second.waiters,
          envelope =>
            envelope.kind === 'error' &&
            envelope.requestId === 'run-after-crash',
        )
        expect(busy).toMatchObject({
          kind: 'error',
          requestId: 'run-after-crash',
          conversationId: 'conversation-1',
          turnId: 'turn-1',
          error: {
            code: 'busy',
            retryable: true,
          },
        })

        second.child.stdin.write(
          command({
            type: 'abort_turn',
            requestId: 'abort-after-crash',
            conversationId: 'conversation-1',
            turnId: 'turn-1',
            reason: 'after_crash',
          }),
        )
        const abortAck = await waitForEnvelope(
          second.envelopes,
          second.waiters,
          envelope =>
            envelope.kind === 'ack' &&
            envelope.requestId === 'abort-after-crash',
        )
        expect(abortAck).toMatchObject({
          kind: 'ack',
          requestId: 'abort-after-crash',
          conversationId: 'conversation-1',
          turnId: 'turn-1',
          payload: {
            state: 'aborting',
            stopReason: 'after_crash',
          },
        })

        const gracefulExit = await stopRuntime(second, 'graceful')
        expect(gracefulExit).toEqual({
          code: 0,
          signal: null,
        })
        expect(second.stderr.join('')).toBe('')
      } finally {
        if (first) {
          await cleanupRuntime(first)
        }
        if (second) {
          await cleanupRuntime(second)
        }
        rmSync(dir, { recursive: true, force: true })
      }
    },
    { timeout: 30_000 },
  )

  test(
    'resumes durable model and tool execution after a process crash',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'kernel-runtime-durable-resume-'))
      const journalPath = join(dir, 'events.ndjson')
      const conversationJournalPath = join(dir, 'conversations.ndjson')
      const resumeMarkerPath = join(dir, 'executor-started')
      const executorEnv = createDurableResumeExecutorEnv(resumeMarkerPath)
      let first: RuntimeHarness | undefined
      let second: RuntimeHarness | undefined

      try {
        first = startRuntime(journalPath, conversationJournalPath, executorEnv)
        first.child.stdin.write(
          command({
            type: 'create_conversation',
            requestId: 'create-1',
            conversationId: 'conversation-1',
            workspacePath: repoRoot,
          }),
        )
        await waitForEnvelope(
          first.envelopes,
          first.waiters,
          envelope => envelope.payload?.type === 'conversation.ready',
        )

        first.child.stdin.write(
          command({
            type: 'run_turn',
            requestId: 'run-1',
            conversationId: 'conversation-1',
            turnId: 'turn-1',
            prompt: 'durable resume prompt',
          }),
        )
        await waitForEnvelope(
          first.envelopes,
          first.waiters,
          envelope => envelope.payload?.type === 'turn.started',
        )
        await waitForEnvelope(
          first.envelopes,
          first.waiters,
          envelope => envelope.kind === 'ack' && envelope.requestId === 'run-1',
        )
        await waitForPath(resumeMarkerPath)

        const killedExit = await stopRuntime(first, 'kill')
        expect(killedExit).toEqual({
          code: null,
          signal: 'SIGKILL',
        })
        expect(first.stderr.join('')).toBe('')

        second = startRuntime(journalPath, conversationJournalPath, executorEnv)
        second.child.stdin.write(
          command({
            type: 'create_conversation',
            requestId: 'create-2',
            conversationId: 'conversation-1',
            workspacePath: repoRoot,
          }),
        )
        const recovered = await waitForEnvelope(
          second.envelopes,
          second.waiters,
          envelope =>
            envelope.kind === 'ack' && envelope.requestId === 'create-2',
        )
        expect(recovered).toMatchObject({
          kind: 'ack',
          requestId: 'create-2',
          conversationId: 'conversation-1',
          payload: {
            state: 'detached',
            activeTurnId: 'turn-1',
          },
        })
        await waitForEnvelope(
          second.envelopes,
          second.waiters,
          envelope => envelope.payload?.type === 'conversation.recovered',
        )

        const resumedOutput = await waitForEnvelope(
          second.envelopes,
          second.waiters,
          envelope =>
            envelope.payload?.type === 'turn.output_delta' &&
            envelope.payload.payload?.text === 'resumed durable execution',
        )
        expect(resumedOutput).toMatchObject({
          kind: 'event',
          conversationId: 'conversation-1',
          turnId: 'turn-1',
        })
        const completed = await waitForEnvelope(
          second.envelopes,
          second.waiters,
          envelope => envelope.payload?.type === 'turn.completed',
        )
        expect(completed).toMatchObject({
          kind: 'event',
          conversationId: 'conversation-1',
          turnId: 'turn-1',
          payload: {
            payload: {
              state: 'completed',
              stopReason: 'success',
            },
          },
        })

        second.child.stdin.write(
          command({
            type: 'run_turn',
            requestId: 'run-after-resume',
            conversationId: 'conversation-1',
            turnId: 'turn-2',
            prompt: 'new turn after resume',
          }),
        )
        await waitForEnvelope(
          second.envelopes,
          second.waiters,
          envelope =>
            envelope.kind === 'ack' &&
            envelope.requestId === 'run-after-resume',
        )

        const gracefulExit = await stopRuntime(second, 'graceful')
        expect(gracefulExit).toEqual({
          code: 0,
          signal: null,
        })
        expect(second.stderr.join('')).toBe('')
      } finally {
        if (first) {
          await cleanupRuntime(first)
        }
        if (second) {
          await cleanupRuntime(second)
        }
        rmSync(dir, { recursive: true, force: true })
      }
    },
    { timeout: 30_000 },
  )
})

function startRuntime(
  journalPath: string,
  conversationJournalPath: string,
  extraEnv: Record<string, string | undefined> = {},
): RuntimeHarness {
  const child = spawn('bun', ['run', 'src/entrypoints/kernel-runtime.ts'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HARE_KERNEL_RUNTIME_EVENT_JOURNAL: journalPath,
      HARE_KERNEL_RUNTIME_CONVERSATION_JOURNAL: conversationJournalPath,
      ...extraEnv,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const stderr: string[] = []
  const envelopes: WireEnvelope[] = []
  const waiters = new Set<() => void>()
  collectChildOutput(child, stderr, envelopes, waiters)
  return { child, stderr, envelopes, waiters }
}

function createDurableResumeExecutorEnv(
  markerPath: string,
): Record<string, string> {
  const script = `
const { existsSync, writeFileSync } = require('fs')
let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => { input += chunk })
process.stdin.on('end', () => {
  const markerPath = process.env.HARE_KERNEL_RUNTIME_TEST_RESUME_MARKER
  if (!existsSync(markerPath)) {
    writeFileSync(markerPath, input)
    setTimeout(() => process.exit(0), 3000)
    return
  }
  console.log(JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'resumed durable execution' }] },
  }))
  console.log(JSON.stringify({
    type: 'result',
    subtype: 'success',
    result: 'resumed durable execution',
    is_error: false,
  }))
})
`
  return {
    HARE_KERNEL_RUNTIME_HEADLESS_EXECUTOR: 'process',
    HARE_KERNEL_RUNTIME_HEADLESS_COMMAND: process.execPath,
    HARE_KERNEL_RUNTIME_HEADLESS_ARGS_JSON: JSON.stringify(['-e', script]),
    HARE_KERNEL_RUNTIME_TEST_RESUME_MARKER: markerPath,
  }
}

function collectChildOutput(
  child: ReturnType<typeof spawn>,
  stderr: string[],
  envelopes: WireEnvelope[],
  waiters: Set<() => void>,
): void {
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => {
    stderr.push(chunk)
  })
  child.stdout.setEncoding('utf8')
  let buffer = ''
  child.stdout.on('data', chunk => {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line.trim().length > 0) {
        envelopes.push(JSON.parse(line) as WireEnvelope)
      }
    }
    for (const waiter of waiters) {
      waiter()
    }
  })
}

async function waitForEnvelope(
  envelopes: readonly WireEnvelope[],
  waiters: Set<() => void>,
  predicate: (envelope: WireEnvelope) => boolean,
): Promise<WireEnvelope> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const existing = envelopes.find(predicate)
    if (existing) {
      return existing
    }
    await new Promise<void>(resolve => {
      const waiter = (): void => {
        waiters.delete(waiter)
        resolve()
      }
      waiters.add(waiter)
      setTimeout(waiter, 50)
    })
  }
  throw new Error('Timed out waiting for kernel runtime envelope')
}

async function waitForPath(path: string): Promise<void> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (existsSync(path)) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error(`Timed out waiting for path ${path}`)
}

async function stopRuntime(
  harness: RuntimeHarness,
  mode: 'graceful' | 'kill',
): Promise<ExitResult> {
  if (harness.child.exitCode !== null || harness.child.signalCode !== null) {
    return {
      code: harness.child.exitCode,
      signal: harness.child.signalCode,
    }
  }

  if (mode === 'kill') {
    harness.child.kill('SIGKILL')
  } else if (!harness.child.stdin.destroyed) {
    harness.child.stdin.end()
  }

  return waitForExit(harness.child)
}

async function cleanupRuntime(harness: RuntimeHarness): Promise<void> {
  if (harness.child.exitCode !== null || harness.child.signalCode !== null) {
    return
  }
  await stopRuntime(harness, 'kill')
}

async function waitForExit(
  child: ReturnType<typeof spawn>,
): Promise<ExitResult> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return {
      code: child.exitCode,
      signal: child.signalCode,
    }
  }

  return new Promise<ExitResult>(resolve => {
    child.once('exit', (code, signal) => {
      resolve({
        code,
        signal,
      })
    })
  })
}
