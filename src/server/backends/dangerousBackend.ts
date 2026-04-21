import type { ChildProcess } from 'child_process'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'

const CLI_ENTRYPOINT_PATH = fileURLToPath(
  new URL('../../entrypoints/cli.tsx', import.meta.url),
)

export type DangerousBackendCreateSessionOptions = {
  cwd: string
  sessionId: string
  dangerouslySkipPermissions?: boolean
}

export type DangerousBackendSession = {
  sessionId: string
  workDir: string
  process: ChildProcess
  stdout: NonNullable<ChildProcess['stdout']>
  stderr: NonNullable<ChildProcess['stderr']>
  writeLine(data: string): boolean
  terminate(): void
  forceKill(): void
}

export class DangerousBackend {
  createSessionRuntime(
    options: DangerousBackendCreateSessionOptions,
  ): DangerousBackendSession {
    const cliArgs = [
      '--print',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      '--session-id',
      options.sessionId,
    ]

    if (options.dangerouslySkipPermissions) {
      cliArgs.push('--dangerously-skip-permissions')
    }

    const isBundledMode =
      typeof Bun !== 'undefined' &&
      Array.isArray(Bun.embeddedFiles) &&
      Bun.embeddedFiles.length > 0
    const bootstrapArgs = [...process.execArgv]
    const args =
      isBundledMode
        ? [...bootstrapArgs, ...cliArgs]
        : [...bootstrapArgs, CLI_ENTRYPOINT_PATH, ...cliArgs]

    const child = spawn(process.execPath, args, {
      cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CLAUDE_CODE_SKIP_PROMPT_HISTORY: '1',
      },
      windowsHide: process.platform === 'win32',
    })

    if (!child.stdin || !child.stdout || !child.stderr) {
      throw new Error('Failed to create stdio pipes for direct-connect session')
    }

    return {
      sessionId: options.sessionId,
      workDir: options.cwd,
      process: child,
      stdout: child.stdout,
      stderr: child.stderr,
      writeLine(data: string) {
        const stdin = child.stdin!
        if (stdin.destroyed || !stdin.writable) {
          return false
        }

        try {
          stdin.write(data.endsWith('\n') ? data : `${data}\n`)
          return true
        } catch {
          return false
        }
      },
      terminate() {
        if (process.platform === 'win32') {
          child.kill()
        } else {
          child.kill('SIGTERM')
        }
      },
      forceKill() {
        if (process.platform === 'win32') {
          child.kill()
        } else {
          child.kill('SIGKILL')
        }
      },
    }
  }
}
