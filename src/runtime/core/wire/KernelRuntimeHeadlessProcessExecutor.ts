import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { createInterface } from 'readline'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import type {
  KernelRuntimeWireTurnExecutionEvent,
  KernelRuntimeWireTurnExecutor,
} from './KernelRuntimeWireRouter.js'

export type KernelRuntimeHeadlessProcessExecutorOptions = {
  command?: string
  args?: readonly string[]
  cwd?: string
  env?: Record<string, string | undefined>
  killTimeoutMs?: number
}

type HeadlessProcessCommand = {
  command: string
  args: readonly string[]
}

type HeadlessProcessExit = {
  code: number | null
  signal: NodeJS.Signals | null
}

const DEFAULT_HEADLESS_ARGS = [
  '--print',
  '--output-format',
  'stream-json',
  '--verbose',
] as const

export function createKernelRuntimeHeadlessProcessExecutor(
  options: KernelRuntimeHeadlessProcessExecutorOptions = {},
): KernelRuntimeWireTurnExecutor {
  return async function* runHeadlessProcessTurn(context) {
    const resolved = resolveHeadlessProcessCommand(options)
    const child = spawn(resolved.command, resolved.args, {
      cwd: options.cwd ?? context.conversation.snapshot().workspacePath,
      env: {
        ...process.env,
        ...options.env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stderr: string[] = []
    const killTimeoutMs = options.killTimeoutMs ?? 5000
    let killTimer: ReturnType<typeof setTimeout> | undefined

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', chunk => {
      stderr.push(String(chunk))
      if (stderr.join('').length > 16_384) {
        stderr.splice(0, stderr.length, stderr.join('').slice(-16_384))
      }
    })

    const abortChild = (): void => {
      if (child.exitCode !== null || child.killed) {
        return
      }
      child.kill('SIGINT')
      killTimer = setTimeout(() => {
        if (child.exitCode === null && !child.killed) {
          child.kill('SIGKILL')
        }
      }, killTimeoutMs)
      killTimer.unref?.()
    }

    if (context.signal.aborted) {
      abortChild()
    } else {
      context.signal.addEventListener('abort', abortChild, { once: true })
    }

    const exitPromise = new Promise<HeadlessProcessExit>((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) => resolve({ code, signal }))
    })

    child.stdin.end(serializePromptForHeadlessStdin(context.command.prompt))

    let terminalSeen = false
    try {
      const lines = createInterface({
        input: child.stdout,
        crlfDelay: Number.POSITIVE_INFINITY,
      })
      for await (const line of lines) {
        if (line.trim().length === 0) {
          continue
        }
        const message = parseHeadlessStdoutMessage(line)
        for (const event of mapHeadlessStdoutMessage(message)) {
          if (event.type === 'completed' || event.type === 'failed') {
            terminalSeen = true
          }
          yield event
        }
      }

      const exit = await exitPromise
      if (killTimer) {
        clearTimeout(killTimer)
      }
      if (context.signal.aborted) {
        throw new Error('Headless process executor was aborted')
      }
      if (!terminalSeen && exit.code !== 0) {
        throw new Error(
          formatHeadlessProcessExitError(exit, stderr.join('').trim()),
        )
      }
      if (!terminalSeen) {
        yield { type: 'completed', stopReason: 'end_turn' }
      }
    } finally {
      context.signal.removeEventListener('abort', abortChild)
      if (killTimer) {
        clearTimeout(killTimer)
      }
      if (child.exitCode === null && !child.killed) {
        child.kill('SIGKILL')
      }
    }
  }
}

export function readHeadlessProcessExecutorOptionsFromEnv():
  | KernelRuntimeHeadlessProcessExecutorOptions
  | undefined {
  if (process.env.HARE_KERNEL_RUNTIME_HEADLESS_EXECUTOR !== 'process') {
    return undefined
  }

  return {
    command: process.env.HARE_KERNEL_RUNTIME_HEADLESS_COMMAND,
    args: parseArgsEnv(process.env.HARE_KERNEL_RUNTIME_HEADLESS_ARGS_JSON),
    cwd: process.env.HARE_KERNEL_RUNTIME_HEADLESS_CWD,
  }
}

function resolveHeadlessProcessCommand(
  options: KernelRuntimeHeadlessProcessExecutorOptions,
): HeadlessProcessCommand {
  if (options.command) {
    return {
      command: options.command,
      args: options.args ?? [],
    }
  }

  const defaultCommand = resolveDefaultCliCommand()
  return {
    command: defaultCommand.command,
    args: options.args ?? defaultCommand.args,
  }
}

function resolveDefaultCliCommand(): HeadlessProcessCommand {
  const currentModulePath = fileURLToPath(import.meta.url)
  const sourceCliPath = join(
    dirname(currentModulePath),
    '..',
    '..',
    '..',
    'entrypoints',
    'cli.tsx',
  )
  if (existsSync(sourceCliPath)) {
    return {
      command: process.execPath,
      args: ['run', sourceCliPath, ...DEFAULT_HEADLESS_ARGS],
    }
  }

  const distDir = dirname(currentModulePath)
  const bunCliPath = join(distDir, 'cli-bun.js')
  if (existsSync(bunCliPath)) {
    return {
      command: process.execPath,
      args: [bunCliPath, ...DEFAULT_HEADLESS_ARGS],
    }
  }

  const nodeCliPath = join(distDir, 'cli-node.js')
  if (existsSync(nodeCliPath)) {
    return {
      command: process.execPath,
      args: [nodeCliPath, ...DEFAULT_HEADLESS_ARGS],
    }
  }

  return {
    command: 'hare',
    args: DEFAULT_HEADLESS_ARGS,
  }
}

function parseArgsEnv(value: string | undefined): readonly string[] | undefined {
  if (!value) {
    return undefined
  }
  const parsed = JSON.parse(value) as unknown
  if (
    !Array.isArray(parsed) ||
    parsed.some(item => typeof item !== 'string')
  ) {
    throw new Error('HARE_KERNEL_RUNTIME_HEADLESS_ARGS_JSON must be a string array')
  }
  return parsed
}

function serializePromptForHeadlessStdin(prompt: string | readonly unknown[]): string {
  if (typeof prompt === 'string') {
    return prompt
  }
  return JSON.stringify(prompt)
}

function parseHeadlessStdoutMessage(line: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(line) as unknown
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, unknown>
    }
  } catch (error) {
    throw new Error(
      `Headless process emitted invalid JSON: ${line.slice(0, 500)}`,
      { cause: error },
    )
  }
  throw new Error(`Headless process emitted non-object JSON: ${line.slice(0, 500)}`)
}

function mapHeadlessStdoutMessage(
  message: Record<string, unknown>,
): KernelRuntimeWireTurnExecutionEvent[] {
  const events: KernelRuntimeWireTurnExecutionEvent[] = [
    {
      type: 'event',
      event: {
        type: 'headless.sdk_message',
        replayable: true,
        payload: message,
      },
    },
  ]

  if (shouldEmitOutputDelta(message)) {
    events.push({
      type: 'output',
      payload: {
        message,
      },
    })
  }

  if (message.type === 'result') {
    if (typeof message.result === 'string' && message.result.length > 0) {
      events.push({
        type: 'output',
        payload: {
          text: message.result,
          message,
        },
      })
    }

    if (message.is_error) {
      events.push({
        type: 'failed',
        error: {
          message: formatHeadlessResultError(message),
          result: message,
        },
      })
    } else {
      events.push({
        type: 'completed',
        stopReason:
          typeof message.subtype === 'string' ? message.subtype : 'end_turn',
      })
    }
  }

  return events
}

function shouldEmitOutputDelta(message: Record<string, unknown>): boolean {
  return (
    message.type === 'assistant' ||
    message.type === 'stream_event' ||
    message.type === 'streamlined_text' ||
    message.type === 'streamlined_tool_use_summary'
  )
}

function formatHeadlessResultError(message: Record<string, unknown>): string {
  if (typeof message.subtype === 'string') {
    return `Headless process returned ${message.subtype}`
  }
  return 'Headless process returned an error result'
}

function formatHeadlessProcessExitError(
  exit: HeadlessProcessExit,
  stderr: string,
): string {
  const suffix = stderr ? `: ${stderr.slice(-4000)}` : ''
  if (exit.signal) {
    return `Headless process exited from signal ${exit.signal}${suffix}`
  }
  return `Headless process exited with code ${exit.code ?? 'unknown'}${suffix}`
}
