import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { createInterface } from 'readline'
import { fileURLToPath } from 'url'

import type {
  RuntimeAgentDescriptor,
  RuntimeAgentRunDescriptor,
  RuntimeAgentSpawnRequest,
} from '../runtime/contracts/agent.js'

export type KernelRuntimeAgentProcessExecutorOptions = {
  command?: string
  args?: readonly string[]
  cwd?: string
  env?: Record<string, string | undefined>
  killTimeoutMs?: number
}

export type KernelRuntimeAgentExecutorOutput = {
  outputFile: string
  append(content: string): void
  flush(): Promise<void>
}

export type KernelRuntimeAgentExecutorContext = {
  request: RuntimeAgentSpawnRequest
  run: RuntimeAgentRunDescriptor
  agent: RuntimeAgentDescriptor
  cwd: string
  signal: AbortSignal
  output: KernelRuntimeAgentExecutorOutput
}

export type KernelRuntimeAgentExecutorResult = {
  result?: unknown
  agentId?: string
  backgroundTaskId?: string
  outputFile?: string
  metadata?: Record<string, unknown>
}

export type KernelRuntimeAgentExecutor = (
  context: KernelRuntimeAgentExecutorContext,
) => Promise<KernelRuntimeAgentExecutorResult | void>

type AgentProcessCommand = {
  command: string
  args: readonly string[]
}

type AgentProcessExit = {
  code: number | null
  signal: NodeJS.Signals | null
}

const DEFAULT_AGENT_ARGS = [
  '--print',
  '--output-format',
  'stream-json',
  '--verbose',
] as const

export function createKernelRuntimeAgentProcessExecutor(
  options: KernelRuntimeAgentProcessExecutorOptions = {},
): KernelRuntimeAgentExecutor {
  return async context => {
    const resolved = resolveAgentProcessCommand(options)
    const args = withAgentProcessArgs(
      resolved.args,
      context.agent.agentType,
      context.request.model ?? context.agent.model,
    )
    const child = spawn(resolved.command, args, {
      cwd: options.cwd ?? context.request.cwd ?? context.run.cwd ?? context.cwd,
      env: {
        ...process.env,
        ...options.env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stderr: string[] = []
    const killTimeoutMs = options.killTimeoutMs ?? 5000
    let killTimer: ReturnType<typeof setTimeout> | undefined
    let finalResult: unknown
    let emittedOutput = false

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', chunk => {
      stderr.push(String(chunk))
      const joined = stderr.join('')
      if (joined.length > 16_384) {
        stderr.splice(0, stderr.length, joined.slice(-16_384))
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

    const exitPromise = new Promise<AgentProcessExit>((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) => resolve({ code, signal }))
    })

    child.stdin.end(context.request.prompt)

    try {
      const lines = createInterface({
        input: child.stdout,
        crlfDelay: Number.POSITIVE_INFINITY,
      })
      for await (const line of lines) {
        if (line.trim().length === 0) {
          continue
        }
        const message = parseAgentStdoutMessage(line)
        const text = extractAgentOutputText(message)
        if (text) {
          emittedOutput = true
          context.output.append(ensureTrailingNewline(text))
        }
        if (message.type === 'result') {
          finalResult = message.result
          if (message.is_error) {
            throw new Error(formatAgentResultError(message))
          }
          if (!emittedOutput && typeof message.result === 'string') {
            context.output.append(ensureTrailingNewline(message.result))
          }
        }
      }

      const exit = await exitPromise
      if (context.signal.aborted) {
        throw new Error('Agent process executor was aborted')
      }
      if (exit.code !== 0) {
        throw new Error(
          formatAgentProcessExitError(exit, stderr.join('').trim()),
        )
      }
      return {
        result: finalResult,
        outputFile: context.output.outputFile,
        metadata: {
          executor: 'process',
          exitCode: exit.code,
          signal: exit.signal,
        },
      }
    } finally {
      context.signal.removeEventListener('abort', abortChild)
      if (killTimer) {
        clearTimeout(killTimer)
      }
      if (child.exitCode === null && !child.killed) {
        child.kill('SIGKILL')
      }
      await context.output.flush()
    }
  }
}

export function readAgentProcessExecutorOptionsFromEnv():
  | false
  | KernelRuntimeAgentProcessExecutorOptions
  | undefined {
  switch (process.env.HARE_KERNEL_RUNTIME_AGENT_EXECUTOR) {
    case 'false':
    case 'none':
    case 'disabled':
      return false
    case 'process':
      return {
        command: process.env.HARE_KERNEL_RUNTIME_AGENT_COMMAND,
        args: parseArgsEnv(process.env.HARE_KERNEL_RUNTIME_AGENT_ARGS_JSON),
        cwd: process.env.HARE_KERNEL_RUNTIME_AGENT_CWD,
      }
    default:
      return undefined
  }
}

function resolveAgentProcessCommand(
  options: KernelRuntimeAgentProcessExecutorOptions,
): AgentProcessCommand {
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

function resolveDefaultCliCommand(): AgentProcessCommand {
  const currentModulePath = fileURLToPath(import.meta.url)
  const sourceCliPath = join(
    dirname(currentModulePath),
    '..',
    'entrypoints',
    'cli.tsx',
  )
  if (existsSync(sourceCliPath)) {
    return {
      command: process.execPath,
      args: ['run', sourceCliPath, ...DEFAULT_AGENT_ARGS],
    }
  }

  const distDir = dirname(currentModulePath)
  const bunCliPath = join(distDir, 'cli-bun.js')
  if (existsSync(bunCliPath)) {
    return {
      command: process.execPath,
      args: [bunCliPath, ...DEFAULT_AGENT_ARGS],
    }
  }

  const nodeCliPath = join(distDir, 'cli-node.js')
  if (existsSync(nodeCliPath)) {
    return {
      command: process.execPath,
      args: [nodeCliPath, ...DEFAULT_AGENT_ARGS],
    }
  }

  return {
    command: 'hare',
    args: DEFAULT_AGENT_ARGS,
  }
}

function withAgentProcessArgs(
  args: readonly string[],
  agentType: string | undefined,
  model: string | undefined,
): readonly string[] {
  const next = [...args]
  if (agentType && !hasCliOption(next, '--agent')) {
    next.push('--agent', agentType)
  }
  if (model && !hasCliOption(next, '--model')) {
    next.push('--model', model)
  }
  return next
}

function hasCliOption(args: readonly string[], name: string): boolean {
  return args.some(arg => arg === name || arg.startsWith(`${name}=`))
}

function parseArgsEnv(
  value: string | undefined,
): readonly string[] | undefined {
  if (!value) {
    return undefined
  }
  const parsed = JSON.parse(value) as unknown
  if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string')) {
    throw new Error(
      'HARE_KERNEL_RUNTIME_AGENT_ARGS_JSON must be a string array',
    )
  }
  return parsed
}

function parseAgentStdoutMessage(line: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(line) as unknown
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, unknown>
    }
  } catch (error) {
    throw new Error(
      `Agent process emitted invalid JSON: ${line.slice(0, 500)}`,
      { cause: error },
    )
  }
  throw new Error(
    `Agent process emitted non-object JSON: ${line.slice(0, 500)}`,
  )
}

function extractAgentOutputText(
  message: Record<string, unknown>,
): string | undefined {
  if (message.type === 'streamlined_text' && typeof message.text === 'string') {
    return message.text
  }
  if (
    message.type === 'streamlined_tool_use_summary' &&
    typeof message.tool_summary === 'string'
  ) {
    return message.tool_summary
  }
  if (message.type !== 'assistant') {
    return undefined
  }
  const apiMessage = message.message
  if (!apiMessage || typeof apiMessage !== 'object') {
    return undefined
  }
  const content = (apiMessage as { content?: unknown }).content
  if (!Array.isArray(content)) {
    return undefined
  }
  const chunks = content
    .map(block =>
      block &&
      typeof block === 'object' &&
      (block as { type?: unknown }).type === 'text' &&
      typeof (block as { text?: unknown }).text === 'string'
        ? String((block as { text: string }).text)
        : '',
    )
    .filter(Boolean)
  return chunks.length > 0 ? chunks.join('\n') : undefined
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`
}

function formatAgentResultError(message: Record<string, unknown>): string {
  const errors = message.errors
  if (Array.isArray(errors) && errors.every(item => typeof item === 'string')) {
    return errors.join('\n')
  }
  if (typeof message.subtype === 'string') {
    return `Agent process returned ${message.subtype}`
  }
  return 'Agent process returned an error result'
}

function formatAgentProcessExitError(
  exit: AgentProcessExit,
  stderr: string,
): string {
  const suffix = stderr ? `: ${stderr.slice(-4000)}` : ''
  if (exit.signal) {
    return `Agent process exited from signal ${exit.signal}${suffix}`
  }
  return `Agent process exited with code ${exit.code ?? 'unknown'}${suffix}`
}
