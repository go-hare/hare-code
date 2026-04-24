import { formatAutonomyDeepStatus } from '../../utils/autonomyStatus.js'
import {
  formatAutonomyFlowDetail,
  formatAutonomyFlowsList,
  formatAutonomyFlowsStatus,
  getAutonomyFlowById,
  listAutonomyFlows,
  requestManagedAutonomyFlowCancel,
} from '../../utils/autonomyFlows.js'
import {
  formatAutonomyRunsList,
  formatAutonomyRunsStatus,
  listAutonomyRuns,
  markAutonomyRunCancelled,
  resumeManagedAutonomyFlowPrompt,
} from '../../utils/autonomyRuns.js'
import {
  enqueuePendingNotification,
  removeByFilter,
} from '../../utils/messageQueueManager.js'

const AUTONOMY_USAGE =
  'Usage: /autonomy [status [--deep]|runs [limit]|flows [limit]|flow <id>|flow cancel <id>|flow resume <id>]'

type DeepSectionId =
  | 'auto-mode'
  | 'runs'
  | 'flows'
  | 'cron'
  | 'teams'
  | 'pipes'
  | 'runtime'
  | 'remote-control'

function parseAutonomyLimit(raw?: string | number): number {
  const parsed = typeof raw === 'number' ? raw : Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 10
  }
  return Math.min(parsed, 50)
}

export async function getAutonomyStatusText(options?: {
  deep?: boolean
}): Promise<string> {
  const [runs, flows] = await Promise.all([
    listAutonomyRuns(),
    listAutonomyFlows(),
  ])

  if (options?.deep) {
    return formatAutonomyDeepStatus({ runs, flows })
  }

  return [
    formatAutonomyRunsStatus(runs),
    formatAutonomyFlowsStatus(flows),
  ].join('\n')
}

export async function getAutonomyDeepSectionText(
  sectionId: DeepSectionId,
): Promise<string> {
  const [runs, flows, full] = await Promise.all([
    listAutonomyRuns(),
    listAutonomyFlows(),
    getAutonomyStatusText({ deep: true }),
  ])

  switch (sectionId) {
    case 'runs':
      return ['# Runs', formatAutonomyRunsStatus(runs)].join('\n')
    case 'flows':
      return ['# Flows', formatAutonomyFlowsStatus(flows)].join('\n')
    case 'auto-mode':
      return full.includes('Auto mode:')
        ? ['# Auto Mode', full.split('## Runs')[0]!.replace('# Autonomy Deep Status\n', '').trim()].join('\n')
        : 'Auto mode section unavailable.'
    case 'cron':
      return extractDeepSection(full, '## Cron')
    case 'teams':
      return extractDeepSection(full, '## Teams')
    case 'pipes':
      return extractDeepSection(full, '## Pipes')
    case 'runtime':
      return extractDeepSection(full, '## Runtime')
    case 'remote-control':
      return extractDeepSection(full, '## Remote Control')
  }
}

function extractDeepSection(full: string, heading: string): string {
  const start = full.indexOf(heading)
  if (start === -1) {
    return `${heading.replace(/^## /, '')} section unavailable.`
  }
  const rest = full.slice(start)
  const nextHeading = rest.indexOf('\n## ', heading.length)
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading)
}

async function cancelAutonomyFlowText(
  flowId: string,
  options?: {
    removeQueuedInMemory?: boolean
  },
): Promise<string> {
  const cancelled = await requestManagedAutonomyFlowCancel({ flowId })
  if (!cancelled) {
    return 'Autonomy flow not found.'
  }
  if (!cancelled.accepted) {
    return `Autonomy flow ${flowId} is already terminal (${cancelled.flow.status}).`
  }

  let removedCount = 0
  if (options?.removeQueuedInMemory) {
    const removed = removeByFilter(cmd => cmd.autonomy?.flowId === flowId)
    removedCount = removed.length
    for (const command of removed) {
      if (command.autonomy?.runId) {
        await markAutonomyRunCancelled(command.autonomy.runId)
      }
    }
  } else {
    for (const runId of cancelled.queuedRunIds) {
      await markAutonomyRunCancelled(runId)
    }
    removedCount = cancelled.queuedRunIds.length
  }

  return cancelled.flow.status === 'running'
    ? `Cancellation requested for flow ${flowId}. The current step is still running, and no new steps will be started.`
    : `Cancelled flow ${flowId}. Removed ${removedCount} queued step(s).`
}

async function resumeAutonomyFlowText(
  flowId: string,
  options?: {
    enqueueInMemory?: boolean
  },
): Promise<string> {
  const command = await resumeManagedAutonomyFlowPrompt({ flowId })
  if (!command) {
    return 'Autonomy flow is not waiting or was not found.'
  }

  if (options?.enqueueInMemory) {
    enqueuePendingNotification(command)
    return `Queued the next managed step for flow ${flowId}.`
  }

  const runId = command.autonomy?.runId ?? 'unknown'
  return [
    `Prepared the next managed step for flow ${flowId}.`,
    `Run ID: ${runId}`,
    '',
    'Prompt:',
    typeof command.value === 'string' ? command.value : String(command.value),
  ].join('\n')
}

export async function getAutonomyCommandText(
  args: string,
  options?: {
    enqueueInMemory?: boolean
    removeQueuedInMemory?: boolean
  },
): Promise<string> {
  const [subcommand = 'status', arg1, arg2] = args.trim().split(/\s+/, 3)

  if (subcommand === '' || subcommand === 'status') {
    return getAutonomyStatusText({ deep: arg1 === '--deep' })
  }

  if (subcommand === 'runs') {
    return formatAutonomyRunsList(
      await listAutonomyRuns(),
      parseAutonomyLimit(arg1),
    )
  }

  if (subcommand === 'flows') {
    return formatAutonomyFlowsList(
      await listAutonomyFlows(),
      parseAutonomyLimit(arg1),
    )
  }

  if (subcommand === 'flow') {
    if (arg1 === 'cancel') {
      return cancelAutonomyFlowText(arg2 ?? '', {
        removeQueuedInMemory: options?.removeQueuedInMemory,
      })
    }
    if (arg1 === 'resume') {
      return resumeAutonomyFlowText(arg2 ?? '', {
        enqueueInMemory: options?.enqueueInMemory,
      })
    }
    if (arg1) {
      return formatAutonomyFlowDetail(await getAutonomyFlowById(arg1))
    }
  }

  return AUTONOMY_USAGE
}

export async function autonomyStatusHandler(
  options?: { deep?: boolean },
): Promise<void> {
  const args = options?.deep ? 'status --deep' : 'status'
  process.stdout.write(`${await getAutonomyCommandText(args)}\n`)
}

export async function autonomyRunsHandler(limit?: string): Promise<void> {
  const args = limit ? `runs ${limit}` : 'runs'
  process.stdout.write(`${await getAutonomyCommandText(args)}\n`)
}

export async function autonomyFlowsHandler(limit?: string): Promise<void> {
  const args = limit ? `flows ${limit}` : 'flows'
  process.stdout.write(`${await getAutonomyCommandText(args)}\n`)
}

export async function autonomyFlowHandler(flowId: string): Promise<void> {
  process.stdout.write(`${await getAutonomyCommandText(`flow ${flowId}`)}\n`)
}

export async function autonomyFlowCancelHandler(flowId: string): Promise<void> {
  process.stdout.write(
    `${await getAutonomyCommandText(`flow cancel ${flowId}`)}\n`,
  )
}

export async function autonomyFlowResumeHandler(flowId: string): Promise<void> {
  process.stdout.write(
    `${await getAutonomyCommandText(`flow resume ${flowId}`)}\n`,
  )
}

export async function autonomyUsageHandler(): Promise<void> {
  process.stdout.write(`${AUTONOMY_USAGE}\n`)
}
