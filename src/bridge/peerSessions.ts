import { readdir, readFile, unlink } from 'fs/promises'
import { basename, join } from 'path'

import { getOriginalCwd, getSessionId } from '../bootstrap/state.js'
import { CROSS_SESSION_MESSAGE_TAG } from '../constants/xml.js'
import { logEvent } from '../services/analytics/index.js'
import { logForDebugging } from '../utils/debug.js'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import { errorMessage, isFsInaccessible } from '../utils/errors.js'
import { isProcessRunning } from '../utils/genericProcessUtils.js'
import { parseAddress } from '../utils/peerAddress.js'
import { getPlatform } from '../utils/platform.js'
import { jsonParse } from '../utils/slowOperations.js'
import { sendEventToRemoteSession } from '../utils/teleport/api.js'
import { isPeerAlive, sendToUdsSocket } from '../utils/udsClient.js'
import { escapeXml, escapeXmlAttr } from '../utils/xml.js'
import { getSelfBridgeCompatId } from './replBridgeHandle.js'

export type PeerTransport = 'uds' | 'bridge'
export type PeerSessionStatus = 'busy' | 'idle' | 'waiting' | 'unknown'

export type PeerSession = {
  id: string
  sessionId: string
  displayName?: string
  cwd?: string
  pid?: number
  status: PeerSessionStatus
  statusDetail?: string
  preferredAddress: string
  alternateAddresses: string[]
  transports: PeerTransport[]
  source: 'local_registry'
  isSelf: boolean
  lastSeenAt?: number
  canReceiveStructuredMessages: false
}

type SessionRegistryRecord = {
  pid?: unknown
  sessionId?: unknown
  cwd?: unknown
  startedAt?: unknown
  updatedAt?: unknown
  status?: unknown
  waitingFor?: unknown
  name?: unknown
  messagingSocketPath?: unknown
  bridgeSessionId?: unknown
}

type PeerBuildOptions = {
  currentPid?: number
  currentSessionId?: string
  currentBridgeSessionId?: string
  currentCwd?: string
  probeSocket?: (socketPath: string) => Promise<boolean>
}

type PostInterClaudeMessageDeps = {
  listPeers?: () => Promise<PeerSession[]>
  sendToUds?: (socketPath: string, text: string) => Promise<void>
  sendRemoteEvent?: (
    sessionId: string,
    content: string,
    opts?: { uuid?: string },
  ) => Promise<boolean>
  getSelfBridgeSessionId?: () => string | undefined
  getCurrentSessionId?: () => string
  getCurrentCwd?: () => string
  getSessionName?: () => string | undefined
}

type CrossSessionTransport = 'uds' | 'bridge'

type CrossSessionMessageEnvelope = {
  from: string
  sessionId: string
  transport: CrossSessionTransport
  text: string
  name?: string
  cwd?: string
}

export async function listPeerSessions(): Promise<PeerSession[]> {
  const records = await readSessionRegistry()
  const peers = await buildPeerSessions(records)

  logEvent('tengu_peers_listed', {
    peer_count: peers.length,
    uds_count: peers.filter(peer => peer.transports.includes('uds')).length,
    bridge_count: peers.filter(peer => peer.transports.includes('bridge'))
      .length,
  })

  return peers
}

export async function postInterClaudeMessage(
  bridgeSessionId: string,
  text: string,
  deps: PostInterClaudeMessageDeps = {},
): Promise<{ ok: boolean; error?: string }> {
  const peers = await (deps.listPeers ?? listPeerSessions)()
  const targetBridgeAddress = `bridge:${bridgeSessionId}`
  const peer = peers.find(
    candidate =>
      candidate.preferredAddress === targetBridgeAddress ||
      candidate.alternateAddresses.includes(targetBridgeAddress),
  )

  if (peer?.isSelf) {
    return {
      ok: false,
      error: `Cannot send a bridge message to the current session (${targetBridgeAddress})`,
    }
  }

  const localAddress = peer
    ? [peer.preferredAddress, ...peer.alternateAddresses].find(
        address => parseAddress(address).scheme === 'uds',
      )
    : undefined

  const sendToUds = deps.sendToUds ?? sendToUdsSocket
  if (localAddress) {
    try {
      const parsed = parseAddress(localAddress)
      await sendToUds(parsed.target, text)
      logEvent('tengu_peers_bridge_alias_local_fallback', {})
      return { ok: true }
    } catch (error) {
      return {
        ok: false,
        error: errorMessage(error),
      }
    }
  }

  const selfBridgeSessionId =
    deps.getSelfBridgeSessionId?.() ?? getSelfBridgeCompatId()
  if (!selfBridgeSessionId) {
    return {
      ok: false,
      error:
        'Current session is not connected to Remote Control, so bridge replies would be unroutable. Start /remote-control first.',
    }
  }

  if (bridgeSessionId === selfBridgeSessionId) {
    return {
      ok: false,
      error: `Cannot send a bridge message to the current session (${targetBridgeAddress})`,
    }
  }

  const currentSessionId = deps.getCurrentSessionId?.() ?? getSessionId()
  const currentCwd = deps.getCurrentCwd?.() ?? getOriginalCwd()
  const sessionName =
    deps.getSessionName?.() ??
    resolveCrossSessionSenderName(
      process.env.CLAUDE_CODE_SESSION_NAME,
      currentCwd,
    )
  const payload = buildCrossSessionMessageXml({
    from: `bridge:${selfBridgeSessionId}`,
    sessionId: currentSessionId,
    transport: 'bridge',
    name: sessionName,
    cwd: currentCwd,
    text,
  })

  try {
    const sent = await (deps.sendRemoteEvent ?? sendEventToRemoteSession)(
      bridgeSessionId,
      payload,
    )

    if (!sent) {
      logEvent('tengu_peers_bridge_remote_failed', {})
      return {
        ok: false,
        error: `Failed to deliver to ${targetBridgeAddress} via the remote session events API`,
      }
    }

    logEvent('tengu_peers_bridge_remote_sent', {
      visible_locally: Boolean(peer),
    })
    return { ok: true }
  } catch (error) {
    logEvent('tengu_peers_bridge_remote_failed', {})
    return {
      ok: false,
      error: errorMessage(error),
    }
  }
}

export async function buildPeerSessions(
  records: SessionRegistryRecord[],
  options: PeerBuildOptions = {},
): Promise<PeerSession[]> {
  const currentPid = options.currentPid ?? process.pid
  const currentSessionId = options.currentSessionId ?? getSessionId()
  const currentBridgeSessionId =
    options.currentBridgeSessionId ?? getSelfBridgeCompatId()
  const currentCwd = options.currentCwd ?? getOriginalCwd()
  const probeSocket = options.probeSocket ?? isPeerAlive

  const grouped = new Map<string, SessionRegistryRecord[]>()
  for (const record of records) {
    const sessionId =
      typeof record.sessionId === 'string' && record.sessionId.trim().length > 0
        ? record.sessionId
        : typeof record.pid === 'number'
          ? `pid:${record.pid}`
          : undefined

    if (!sessionId) {
      continue
    }

    const existing = grouped.get(sessionId)
    if (existing) {
      existing.push(record)
    } else {
      grouped.set(sessionId, [record])
    }
  }

  const peers = await Promise.all(
    Array.from(grouped.entries()).map(
      async ([sessionId, group]): Promise<PeerSession | null> => {
        const newest = [...group].sort(compareRegistryFreshness)[0]
        if (!newest) return null

        const addresses = new Set<string>()
        const transports = new Set<PeerTransport>()

        const socketPaths = group
          .map(record =>
            typeof record.messagingSocketPath === 'string'
              ? record.messagingSocketPath
              : undefined,
          )
          .filter((value): value is string => Boolean(value))

        for (const socketPath of socketPaths) {
          if (await probeSocket(socketPath)) {
            addresses.add(`uds:${socketPath}`)
            transports.add('uds')
          }
        }

        const bridgeIds = group
          .map(record =>
            typeof record.bridgeSessionId === 'string'
              ? record.bridgeSessionId
              : undefined,
          )
          .filter((value): value is string => Boolean(value))

        for (const bridgeId of bridgeIds) {
          addresses.add(`bridge:${bridgeId}`)
          transports.add('bridge')
        }

        if (addresses.size === 0) {
          return null
        }

        const preferredAddress =
          [...addresses].find(
            address => parseAddress(address).scheme === 'uds',
          ) ?? [...addresses][0]

        if (!preferredAddress) {
          return null
        }

        const displayName = resolveDisplayName(newest, sessionId)
        const status = resolveStatus(newest.status)
        const pid = typeof newest.pid === 'number' ? newest.pid : undefined
        const peerBridgeId = bridgeIds[0]
        const isSelf =
          (pid !== undefined && pid === currentPid) ||
          sessionId === currentSessionId ||
          (peerBridgeId !== undefined &&
            currentBridgeSessionId !== undefined &&
            peerBridgeId === currentBridgeSessionId)

        return {
          id: sessionId,
          sessionId,
          displayName,
          cwd: typeof newest.cwd === 'string' ? newest.cwd : undefined,
          pid,
          status,
          statusDetail:
            typeof newest.waitingFor === 'string'
              ? newest.waitingFor
              : undefined,
          preferredAddress,
          alternateAddresses: [...addresses].filter(
            address => address !== preferredAddress,
          ),
          transports: [...transports].sort(),
          source: 'local_registry' as const,
          isSelf,
          lastSeenAt: resolveLastSeenAt(newest),
          canReceiveStructuredMessages: false as const,
        } satisfies PeerSession
      },
    ),
  )

  const resolvedPeers: PeerSession[] = []
  for (const peer of peers) {
    if (peer !== null) {
      resolvedPeers.push(peer)
    }
  }

  return resolvedPeers.sort((left, right) => {
    const selfRank = Number(left.isSelf) - Number(right.isSelf)
    if (selfRank !== 0) return -selfRank

    const cwdRank =
      Number(isSamePath(left.cwd, currentCwd)) -
      Number(isSamePath(right.cwd, currentCwd))
    if (cwdRank !== 0) return -cwdRank

    const statusRank = getStatusRank(left.status) - getStatusRank(right.status)
    if (statusRank !== 0) return statusRank

    const leftName = left.displayName ?? left.sessionId
    const rightName = right.displayName ?? right.sessionId
    const nameRank = leftName.localeCompare(rightName)
    if (nameRank !== 0) return nameRank

    return (right.lastSeenAt ?? 0) - (left.lastSeenAt ?? 0)
  })
}

async function readSessionRegistry(): Promise<SessionRegistryRecord[]> {
  const sessionsDir = join(getClaudeConfigHomeDir(), 'sessions')
  let files: string[]

  try {
    files = await readdir(sessionsDir)
  } catch (error) {
    if (!isFsInaccessible(error)) {
      logForDebugging(`[peerSessions] readdir failed: ${errorMessage(error)}`)
    }
    return []
  }

  const results = await Promise.all(
    files
      .filter(file => /^\d+\.json$/.test(file))
      .map(async (file): Promise<SessionRegistryRecord | null> => {
        const pid = parseInt(file.slice(0, -5), 10)

        if (!isProcessRunning(pid)) {
          if (getPlatform() !== 'wsl') {
            void unlink(join(sessionsDir, file)).catch(() => {})
          }
          return null
        }

        try {
          const raw = await readFile(join(sessionsDir, file), 'utf8')
          const parsed = jsonParse(raw) as SessionRegistryRecord
          return {
            ...parsed,
            pid,
          } satisfies SessionRegistryRecord
        } catch (error) {
          logForDebugging(
            `[peerSessions] failed to read ${file}: ${errorMessage(error)}`,
          )
          return null
        }
      }),
  )

  const records: SessionRegistryRecord[] = []
  for (const record of results) {
    if (record !== null) {
      records.push(record)
    }
  }

  return records
}

function compareRegistryFreshness(
  left: SessionRegistryRecord,
  right: SessionRegistryRecord,
): number {
  const lastSeenRank = resolveLastSeenAt(right) - resolveLastSeenAt(left)
  if (lastSeenRank !== 0) {
    return lastSeenRank
  }

  return resolveStartedAt(right) - resolveStartedAt(left)
}

function resolveStartedAt(record: SessionRegistryRecord): number {
  return typeof record.startedAt === 'number' ? record.startedAt : 0
}

function resolveLastSeenAt(record: SessionRegistryRecord): number {
  return typeof record.updatedAt === 'number'
    ? record.updatedAt
    : resolveStartedAt(record)
}

function resolveStatus(status: unknown): PeerSessionStatus {
  if (status === 'busy' || status === 'idle' || status === 'waiting') {
    return status
  }
  return 'unknown'
}

function resolveDisplayName(
  record: SessionRegistryRecord,
  sessionId: string,
): string {
  if (typeof record.name === 'string' && record.name.trim().length > 0) {
    return record.name.trim()
  }

  if (typeof record.cwd === 'string' && record.cwd.trim().length > 0) {
    const cwd = record.cwd.replace(/[\\/]+$/, '')
    const leaf = basename(cwd)
    if (leaf && leaf !== '.' && leaf !== '/' && leaf !== '\\') {
      return leaf
    }
    return cwd
  }

  return sessionId
}

function buildCrossSessionMessageXml(
  message: CrossSessionMessageEnvelope,
): string {
  const attrs = [
    `from="${escapeXmlAttr(message.from)}"`,
    `session_id="${escapeXmlAttr(message.sessionId)}"`,
    `transport="${escapeXmlAttr(message.transport)}"`,
    message.name ? `name="${escapeXmlAttr(message.name)}"` : null,
    message.cwd ? `cwd="${escapeXmlAttr(message.cwd)}"` : null,
  ]
    .filter(Boolean)
    .join(' ')

  return `<${CROSS_SESSION_MESSAGE_TAG} ${attrs}>
${escapeXml(message.text)}
</${CROSS_SESSION_MESSAGE_TAG}>`
}

function resolveCrossSessionSenderName(
  explicitName: string | undefined,
  cwd: string | undefined,
): string | undefined {
  const trimmedName = explicitName?.trim()
  if (trimmedName) {
    return trimmedName
  }

  const trimmedCwd = cwd?.trim()
  if (!trimmedCwd) {
    return undefined
  }

  const normalized = trimmedCwd.replace(/[\\/]+$/, '')
  const leaf = basename(normalized)
  if (leaf && leaf !== '.' && leaf !== '/' && leaf !== '\\') {
    return leaf
  }

  return normalized
}

function isSamePath(
  left: string | undefined,
  right: string | undefined,
): boolean {
  if (!left || !right) return false
  return left.toLowerCase() === right.toLowerCase()
}

function getStatusRank(status: PeerSessionStatus): number {
  switch (status) {
    case 'busy':
      return 0
    case 'waiting':
      return 1
    case 'idle':
      return 2
    default:
      return 3
  }
}
