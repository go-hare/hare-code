import { randomUUID } from 'crypto'
import { resolve } from 'path'
import {
  type DirectConnectClientSocket,
  RuntimeDirectConnectSession,
} from './RuntimeDirectConnectSession.js'
import { createServerSessionIndexStore } from '../persistence/ServerSessionIndexStore.js'
import {
  noopSessionLogger,
  type SessionLogger,
  type SessionRuntimeBackend,
} from './contracts.js'

type SessionManagerOptions = {
  idleTimeoutMs?: number
  maxSessions?: number
  logger?: SessionLogger
}

type CreateSessionOptions = {
  cwd: string
  dangerouslySkipPermissions?: boolean
}

export class SessionManager {
  private readonly sessions = new Map<string, RuntimeDirectConnectSession>()
  private readonly indexStore = createServerSessionIndexStore()
  private readonly idleTimeoutMs: number
  private readonly maxSessions: number
  private readonly logger?: SessionLogger

  constructor(
    private readonly backend: SessionRuntimeBackend,
    options: SessionManagerOptions = {},
  ) {
    this.idleTimeoutMs = options.idleTimeoutMs ?? 0
    this.maxSessions = options.maxSessions ?? 0
    this.logger = options.logger
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  getSession(sessionId: string): RuntimeDirectConnectSession | null {
    return this.sessions.get(sessionId) ?? null
  }

  async createSession({
    cwd,
    dangerouslySkipPermissions,
  }: CreateSessionOptions): Promise<{ sessionId: string; workDir: string }> {
    const liveSessions = [...this.sessions.values()].filter(session =>
      session.isLive,
    )
    if (this.maxSessions > 0 && liveSessions.length >= this.maxSessions) {
      throw new Error(
        `Maximum concurrent sessions reached (${this.maxSessions})`,
      )
    }

    const workDir = resolve(cwd)
    const sessionId = randomUUID()
    const runtime = this.backend.createSessionRuntime({
      cwd: workDir,
      sessionId,
      dangerouslySkipPermissions,
    })
    const session = new RuntimeDirectConnectSession(
      runtime,
      this.logger ?? noopSessionLogger,
      this.idleTimeoutMs,
      endedSession => {
        this.sessions.delete(endedSession.id)
        void this.indexStore.remove(endedSession.id)
      },
    )
    this.sessions.set(sessionId, session)
    await this.indexStore.upsert(sessionId, session.toIndexEntry())

    return { sessionId, workDir }
  }

  attachClient(
    sessionId: string,
    socket: DirectConnectClientSocket,
  ): RuntimeDirectConnectSession | null {
    const session = this.sessions.get(sessionId) ?? null
    session?.attachClient(socket)
    if (session) {
      void this.indexStore.upsert(session.id, session.toIndexEntry())
    }
    return session
  }

  detachClient(sessionId: string, socket: DirectConnectClientSocket): void {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return
    }

    session.detachClient(socket)
    void this.indexStore.upsert(session.id, session.toIndexEntry())
  }

  handleClientMessage(sessionId: string, rawMessage: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return false
    }

    const handled = session.handleClientMessage(rawMessage)
    if (handled) {
      void this.indexStore.upsert(session.id, session.toIndexEntry())
    }
    return handled
  }

  async destroyAll(): Promise<void> {
    await Promise.allSettled(
      [...this.sessions.values()].map(session => session.stopAndWait(true)),
    )
    this.sessions.clear()
  }
}
