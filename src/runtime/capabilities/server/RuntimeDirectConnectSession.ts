import { createInterface } from 'readline'
import {
  createSessionPersistenceOwner,
  type RuntimeSessionPersistenceOwner,
} from '../persistence/SessionPersistenceOwner.js'
import type { DangerousBackendSession } from '../../../server/backends/dangerousBackend.js'
import type { ServerLogger } from '../../../server/serverLog.js'
import type { SessionInfo, SessionState } from '../../../server/types.js'
import type { RuntimeSessionIndexEntry } from '../persistence/ServerSessionIndexStore.js'

const MAX_BACKLOG_LINES = 500

export type SessionSocketData = {
  sessionId: string
}

export type DirectConnectClientSocket = {
  send(data: string): unknown
  close(code?: number, reason?: string): unknown
}

export class RuntimeDirectConnectSession {
  readonly persistenceOwner: RuntimeSessionPersistenceOwner
  readonly info: SessionInfo
  readonly closed: Promise<void>

  private readonly backlog: string[] = []
  private readonly clients = new Set<DirectConnectClientSocket>()
  private readonly createdAt = Date.now()

  private lastActiveAt = Date.now()
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private closeResolver!: () => void

  constructor(
    private readonly runtime: DangerousBackendSession,
    private readonly logger: ServerLogger,
    private readonly idleTimeoutMs: number,
    private readonly onStopped: (session: RuntimeDirectConnectSession) => void,
  ) {
    this.persistenceOwner = createSessionPersistenceOwner(runtime.sessionId)
    this.info = {
      id: runtime.sessionId,
      status: 'starting',
      createdAt: this.createdAt,
      workDir: runtime.workDir,
      process: runtime.process,
    }
    this.closed = new Promise<void>(resolve => {
      this.closeResolver = resolve
    })

    this.installProcessListeners()
    this.setStatus('running')
  }

  get id(): string {
    return this.info.id
  }

  get status(): SessionState {
    return this.info.status
  }

  get workDir(): string {
    return this.info.workDir
  }

  get isLive(): boolean {
    return this.info.status !== 'stopped' && this.info.status !== 'stopping'
  }

  attachClient(socket: DirectConnectClientSocket): void {
    this.clearIdleTimer()
    this.touch()
    this.clients.add(socket)
    if (this.info.status === 'detached') {
      this.setStatus('running')
    }

    for (const line of this.backlog) {
      socket.send(line)
    }
  }

  detachClient(socket: DirectConnectClientSocket): void {
    this.clients.delete(socket)
    this.touch()

    if (this.clients.size === 0 && this.isLive) {
      this.setStatus('detached')
      this.startIdleTimer()
    }
  }

  handleClientMessage(rawMessage: string): boolean {
    if (!this.isLive) {
      return false
    }

    this.touch()
    if (this.info.status === 'detached') {
      this.clearIdleTimer()
      this.setStatus('running')
    }

    return this.runtime.writeLine(rawMessage)
  }

  async stopAndWait(force = false): Promise<void> {
    if (!this.isLive) {
      await this.closed
      return
    }

    this.clearIdleTimer()
    this.setStatus('stopping')
    if (force) {
      this.runtime.forceKill()
    } else {
      this.runtime.terminate()
    }
    await this.closed
  }

  toIndexEntry(): RuntimeSessionIndexEntry {
    return {
      sessionId: this.id,
      transcriptSessionId: this.id,
      cwd: this.workDir,
      createdAt: this.createdAt,
      lastActiveAt: this.lastActiveAt,
    }
  }

  private installProcessListeners(): void {
    const stdout = createInterface({ input: this.runtime.stdout })
    stdout.on('line', line => {
      this.touch()
      this.pushBacklog(line)

      for (const socket of this.clients) {
        socket.send(line)
      }
    })

    const stderr = createInterface({ input: this.runtime.stderr })
    stderr.on('line', line => {
      this.logger.debug('Direct-connect child stderr', {
        sessionId: this.id,
        line,
      })
    })

    this.runtime.process.on('close', (code, signal) => {
      stdout.close()
      stderr.close()
      this.clearIdleTimer()
      this.info.process = null
      this.setStatus('stopped')
      for (const socket of this.clients) {
        socket.close(1000, 'Session ended')
      }
      this.clients.clear()
      this.logger.info('Direct-connect session stopped', {
        sessionId: this.id,
        code,
        signal,
      })
      this.closeResolver()
      this.onStopped(this)
    })
  }

  private setStatus(status: SessionState): void {
    this.info.status = status
  }

  private touch(): void {
    this.lastActiveAt = Date.now()
  }

  private pushBacklog(line: string): void {
    if (this.backlog.length >= MAX_BACKLOG_LINES) {
      this.backlog.shift()
    }
    this.backlog.push(line)
  }

  private startIdleTimer(): void {
    if (this.idleTimeoutMs <= 0 || this.idleTimer !== null) {
      return
    }

    this.idleTimer = setTimeout(() => {
      this.logger.info('Direct-connect session idle timeout reached', {
        sessionId: this.id,
        idleTimeoutMs: this.idleTimeoutMs,
      })
      void this.stopAndWait()
    }, this.idleTimeoutMs)
    this.idleTimer.unref?.()
  }

  private clearIdleTimer(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
  }
}
