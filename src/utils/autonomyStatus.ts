import { readdir } from 'fs/promises'
import { join } from 'path'
import { listLiveSessions } from '../cli/bg.js'
import { queryDaemonStatus } from '../daemon/state.js'
import { formatAutonomyFlowsStatus, type AutonomyFlowRecord } from './autonomyFlows.js'
import { formatAutonomyRunsStatus, type AutonomyRunRecord } from './autonomyRuns.js'
import { cronToHuman } from './cron.js'
import { listAllCronTasks, nextCronRunMs } from './cronTasks.js'
import { getTeamsDir } from './envUtils.js'
import { isAutoModeGateEnabled, getAutoModeUnavailableReason } from './permissions/permissionSetup.js'
import { getAliveSubs, isMainAlive, readRegistry } from './pipeRegistry.js'
import { getTeammateStatuses } from './teamDiscovery.js'
import { listTasks } from './tasks.js'

type DeepStatusParams = {
  runs: AutonomyRunRecord[]
  flows: AutonomyFlowRecord[]
  nowMs?: number
}

async function listTeamNames(): Promise<string[]> {
  try {
    const entries = await readdir(getTeamsDir(), { withFileTypes: true })
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort()
  } catch {
    return []
  }
}

function formatAutoModeSection(): string {
  try {
    const available = isAutoModeGateEnabled()
    return [
      `Auto mode: ${available ? 'available' : 'unavailable'}`,
      `  reason=${getAutoModeUnavailableReason() ?? 'none'}`,
    ].join('\n')
  } catch (error) {
    return [
      'Auto mode: unknown',
      `  reason=${error instanceof Error ? error.message : String(error)}`,
    ].join('\n')
  }
}

async function formatCronSection(nowMs: number): Promise<string> {
  const jobs = await listAllCronTasks()
  if (jobs.length === 0) {
    return ['Cron jobs: 0', '  none'].join('\n')
  }

  const lines = [`Cron jobs: ${jobs.length}`]
  for (const job of jobs.slice(0, 10)) {
    const next = nextCronRunMs(job.cron, nowMs)
    lines.push(
      `  ${job.id}: ${cronToHuman(job.cron)} ${job.recurring ? 'recurring' : 'one-shot'} ${job.durable === false ? 'session-only' : 'durable'} next=${next ? new Date(next).toLocaleString() : 'none'}`,
    )
  }
  if (jobs.length > 10) {
    lines.push(`  ... ${jobs.length - 10} more job(s)`)
  }
  return lines.join('\n')
}

async function formatTeamsSection(): Promise<string> {
  const teamNames = await listTeamNames()
  if (teamNames.length === 0) {
    return ['Teams: 0', '  none'].join('\n')
  }

  const lines = [`Teams: ${teamNames.length}`]
  for (const teamName of teamNames) {
    const teammates = getTeammateStatuses(teamName)
    const tasks = await listTasks(teamName)
    const openTasks = tasks.filter(task => task.status !== 'completed')
    const running = teammates.filter(teammate => teammate.status === 'running').length
    const idle = teammates.filter(teammate => teammate.status === 'idle').length
    lines.push(
      `  ${teamName}: teammates=${teammates.length} running=${running} idle=${idle} open_tasks=${openTasks.length}`,
    )
  }

  return lines.join('\n')
}

async function formatPipesSection(): Promise<string> {
  const [registry, mainAlive, aliveSubs] = await Promise.all([
    readRegistry(),
    isMainAlive(),
    getAliveSubs(),
  ])

  const lines = [
    `Pipes: main=${registry.main ? (mainAlive ? 'alive' : 'stale') : 'none'} subs=${aliveSubs.length}/${registry.subs.length}`,
  ]
  if (registry.main) {
    lines.push(`  main=${registry.main.hostname} pid=${registry.main.pid}`)
  }
  for (const sub of aliveSubs.slice(0, 8)) {
    lines.push(`  sub#${sub.subIndex}=${sub.hostname} pid=${sub.pid}`)
  }
  if (aliveSubs.length > 8) {
    lines.push(`  ... ${aliveSubs.length - 8} more sub(s)`)
  }
  return lines.join('\n')
}

async function formatRuntimeSection(): Promise<string> {
  const daemon = queryDaemonStatus()
  const sessions = await listLiveSessions()
  const lines = [
    `Daemon: ${daemon.status}${daemon.state ? ` pid=${daemon.state.pid} workers=${daemon.state.workerKinds.join(',')}` : ''}`,
    `Background sessions: ${sessions.length}`,
  ]
  for (const session of sessions.slice(0, 8)) {
    lines.push(
      `  pid=${session.pid} kind=${session.kind} status=${session.status ?? 'unknown'} cwd=${session.cwd}`,
    )
  }
  if (sessions.length > 8) {
    lines.push(`  ... ${sessions.length - 8} more session(s)`)
  }
  return lines.join('\n')
}

function formatRemoteControlSection(): string {
  const daemon = queryDaemonStatus('remote-control')
  if (daemon.status !== 'running' || !daemon.state) {
    return `Remote Control: ${daemon.status}`
  }
  return `Remote Control: running pid=${daemon.state.pid} cwd=${daemon.state.cwd}`
}

export async function formatAutonomyDeepStatus(
  params: DeepStatusParams,
): Promise<string> {
  const sections = await Promise.all([
    Promise.resolve(['# Autonomy Deep Status', formatAutoModeSection()].join('\n')),
    Promise.resolve(['## Runs', formatAutonomyRunsStatus(params.runs)].join('\n')),
    Promise.resolve(['## Flows', formatAutonomyFlowsStatus(params.flows)].join('\n')),
    formatCronSection(params.nowMs ?? Date.now()).then(content => ['## Cron', content].join('\n')),
    formatTeamsSection().then(content => ['## Teams', content].join('\n')),
    formatPipesSection().then(content => ['## Pipes', content].join('\n')),
    formatRuntimeSection().then(content => ['## Runtime', content].join('\n')),
    Promise.resolve(['## Remote Control', formatRemoteControlSection()].join('\n')),
  ])

  return sections.join('\n\n')
}
