import { assembleServerHost } from './serverKernelDeps.js'
import type {
  KernelServerHostAssembly,
  KernelServerHostConfigInput,
} from '../../../kernel/serverHost.js'
import {
  probeRunningServer,
  removeServerLock,
  type ServerLockInfo,
  writeServerLock,
} from '../../../server/lockfile.js'
import { printBanner } from '../../../server/serverBanner.js'

type ShutdownSignal = 'SIGINT' | 'SIGTERM'

export type ServerLaunchOptions = {
  input: Omit<KernelServerHostConfigInput, 'createAuthToken'>
  createAuthToken: NonNullable<KernelServerHostConfigInput['createAuthToken']>
}

export type ServerLaunchDeps = {
  assembleServerHost(
    input: KernelServerHostConfigInput,
  ): KernelServerHostAssembly
  probeRunningServer(): Promise<ServerLockInfo | null>
  writeServerLock(info: ServerLockInfo): Promise<void>
  removeServerLock(): Promise<void>
  printBanner(
    config: KernelServerHostAssembly['config'],
    authToken: string,
    actualPort: number,
  ): void
  writeStderr(message: string): void
  once(signal: ShutdownSignal, handler: () => void): void
  exit(code: number): void
  pid: number
  now(): number
}

const defaultServerLaunchDeps: ServerLaunchDeps = {
  assembleServerHost,
  probeRunningServer,
  writeServerLock,
  removeServerLock,
  printBanner,
  writeStderr(message) {
    process.stderr.write(message)
  },
  once(signal, handler) {
    process.once(signal, handler)
  },
  exit(code) {
    process.exit(code)
  },
  pid: process.pid,
  now() {
    return Date.now()
  },
}

export async function runServerLaunch(
  options: ServerLaunchOptions,
  deps: ServerLaunchDeps = defaultServerLaunchDeps,
): Promise<void> {
  const existing = await deps.probeRunningServer()
  if (existing) {
    deps.writeStderr(
      `A claude server is already running (pid ${existing.pid}) at ${existing.httpUrl}\n`,
    )
    deps.exit(1)
    return
  }

  const { authToken, config, server, sessionManager } = deps.assembleServerHost({
    ...options.input,
    createAuthToken: options.createAuthToken,
  })
  const actualPort = server.port ?? config.port
  deps.printBanner(config, authToken, actualPort)

  await deps.writeServerLock({
    pid: deps.pid,
    port: actualPort,
    host: config.host,
    httpUrl: config.unix
      ? `unix:${config.unix}`
      : `http://${config.host}:${actualPort}`,
    startedAt: deps.now(),
  })

  let shuttingDown = false
  const shutdown = async () => {
    if (shuttingDown) return
    shuttingDown = true
    server.stop(true)
    await sessionManager.destroyAll()
    await deps.removeServerLock()
    deps.exit(0)
  }

  deps.once('SIGINT', () => void shutdown())
  deps.once('SIGTERM', () => void shutdown())
}
