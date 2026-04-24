import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import autonomyCommand from '../autonomy'
import autonomyNonInteractive from '../autonomyNonInteractive'
import {
  resetStateForTests,
  setOriginalCwd,
  setProjectRoot,
} from '../../bootstrap/state'
import { listAutonomyFlows } from '../../utils/autonomyFlows'
import {
  createAutonomyQueuedPrompt,
  markAutonomyRunCompleted,
  startManagedAutonomyFlowFromHeartbeatTask,
} from '../../utils/autonomyRuns'
import {
  enqueuePendingNotification,
  getCommandQueueSnapshot,
  resetCommandQueue,
} from '../../utils/messageQueueManager'
import { cleanupTempDir, createTempDir } from '../../../tests/mocks/file-system'
import { getAutonomyPanelBaseActionCountForTests } from '../autonomyPanel'

let tempDir = ''

async function callAutonomy(args = ''): Promise<{
  result?: string
}> {
  const mod = await autonomyCommand.load()
  let result: string | undefined
  const onDone = (text: string) => {
    result = text
  }
  await mod.call(onDone as any, {} as any, args)
  return { result }
}

beforeEach(async () => {
  tempDir = await createTempDir('autonomy-command-')
  resetStateForTests()
  resetCommandQueue()
  setOriginalCwd(tempDir)
  setProjectRoot(tempDir)
})

afterEach(async () => {
  resetStateForTests()
  resetCommandQueue()
  if (tempDir) {
    await cleanupTempDir(tempDir)
  }
})

describe('/autonomy', () => {
  test('non-interactive variant supports text status output', async () => {
    expect(autonomyNonInteractive.type).toBe('local')
    expect(autonomyNonInteractive.supportsNonInteractive).toBe(true)

    const mod = await autonomyNonInteractive.load()
    const result = await mod.call('status', {} as any)

    expect(result.type).toBe('text')
    if (result.type !== 'text') {
      throw new Error(`Expected text result, got ${result.type}`)
    }
    expect(result.value).toContain('Autonomy runs:')
    expect(result.value).toContain('Autonomy flows:')
  })

  test('without args renders the autonomy panel', async () => {
    const mod = await autonomyCommand.load()
    let onDoneCalled = false
    const onDone = () => {
      onDoneCalled = true
    }
    const jsx = await mod.call(onDone as any, {} as any, '')
    expect(jsx).not.toBeNull()
    expect(onDoneCalled).toBe(false)
    expect(getAutonomyPanelBaseActionCountForTests()).toBeGreaterThan(10)
  })

  test('status reports autonomy runs and managed flows separately', async () => {
    const plainRun = await createAutonomyQueuedPrompt({
      basePrompt: 'scheduled prompt',
      trigger: 'scheduled-task',
      rootDir: tempDir,
      currentDir: tempDir,
      sourceLabel: 'nightly',
    })
    expect(plainRun).not.toBeNull()
    await markAutonomyRunCompleted(plainRun!.autonomy!.runId, tempDir)

    await startManagedAutonomyFlowFromHeartbeatTask({
      task: {
        name: 'weekly-report',
        interval: '7d',
        prompt: 'Ship the weekly report',
        steps: [
          {
            name: 'gather',
            prompt: 'Gather weekly inputs',
          },
          {
            name: 'draft',
            prompt: 'Draft the weekly report',
          },
        ],
      },
      rootDir: tempDir,
      currentDir: tempDir,
    })

    const { result } = await callAutonomy('status')

    expect(result).toContain('Autonomy runs: 2')
    expect(result).toContain('Autonomy flows: 1')
    expect(result).toContain('Completed: 1')
    expect(result).toContain('Queued: 1')
  })

  test('runs subcommand lists recent autonomy runs', async () => {
    const queued = await createAutonomyQueuedPrompt({
      basePrompt: '<tick>12:00:00</tick>',
      trigger: 'proactive-tick',
      rootDir: tempDir,
      currentDir: tempDir,
    })

    const { result } = await callAutonomy('runs 5')

    expect(result).toContain(queued!.autonomy!.runId)
    expect(result).toContain('proactive-tick')
  })

  test('flows subcommand lists managed flows and flow subcommand shows detail', async () => {
    await startManagedAutonomyFlowFromHeartbeatTask({
      task: {
        name: 'weekly-report',
        interval: '7d',
        prompt: 'Ship the weekly report',
        steps: [
          {
            name: 'gather',
            prompt: 'Gather weekly inputs',
          },
          {
            name: 'draft',
            prompt: 'Draft the weekly report',
          },
        ],
      },
      rootDir: tempDir,
      currentDir: tempDir,
    })

    const [flow] = await listAutonomyFlows(tempDir)
    const flowsResult = await callAutonomy('flows 5')
    expect(flowsResult.result).toContain(flow!.flowId)
    expect(flowsResult.result).toContain('managed')

    const flowResult = await callAutonomy(`flow ${flow!.flowId}`)
    expect(flowResult.result).toContain(`Flow: ${flow!.flowId}`)
    expect(flowResult.result).toContain('Mode: managed')
    expect(flowResult.result).toContain('Current step: gather')
  })

  test('flow resume queues the next waiting step', async () => {
    const waitingStart = await startManagedAutonomyFlowFromHeartbeatTask({
      task: {
        name: 'weekly-report',
        interval: '7d',
        prompt: 'Ship the weekly report',
        steps: [
          {
            name: 'gather',
            prompt: 'Gather weekly inputs',
            waitFor: 'manual',
          },
          {
            name: 'draft',
            prompt: 'Draft the weekly report',
          },
        ],
      },
      rootDir: tempDir,
      currentDir: tempDir,
    })

    expect(waitingStart).toBeNull()
    const [flow] = await listAutonomyFlows(tempDir)

    const { result } = await callAutonomy(`flow resume ${flow!.flowId}`)

    expect(result).toContain('Queued the next managed step')
    expect(getCommandQueueSnapshot()).toHaveLength(1)
    expect(getCommandQueueSnapshot()[0]!.autonomy?.flowId).toBe(flow!.flowId)
  })

  test('flow cancel removes queued managed steps and marks the flow cancelled', async () => {
    const queued = await startManagedAutonomyFlowFromHeartbeatTask({
      task: {
        name: 'weekly-report',
        interval: '7d',
        prompt: 'Ship the weekly report',
        steps: [
          {
            name: 'gather',
            prompt: 'Gather weekly inputs',
          },
          {
            name: 'draft',
            prompt: 'Draft the weekly report',
          },
        ],
      },
      rootDir: tempDir,
      currentDir: tempDir,
    })

    expect(queued).not.toBeNull()
    enqueuePendingNotification(queued!)
    expect(getCommandQueueSnapshot()).toHaveLength(1)
    const [flow] = await listAutonomyFlows(tempDir)
    const { result } = await callAutonomy(`flow cancel ${flow!.flowId}`)
    const [cancelledFlow] = await listAutonomyFlows(tempDir)

    expect(result).toContain('Cancelled flow')
    expect(cancelledFlow!.status).toBe('cancelled')
    expect(getCommandQueueSnapshot()).toHaveLength(0)
  })

  test('flow cancel refuses to rewrite a terminal managed flow', async () => {
    const queued = await startManagedAutonomyFlowFromHeartbeatTask({
      task: {
        name: 'weekly-report',
        interval: '7d',
        prompt: 'Ship the weekly report',
        steps: [
          {
            name: 'gather',
            prompt: 'Gather weekly inputs',
          },
        ],
      },
      rootDir: tempDir,
      currentDir: tempDir,
    })

    await markAutonomyRunCompleted(queued!.autonomy!.runId, tempDir)

    const [flow] = await listAutonomyFlows(tempDir)
    const { result } = await callAutonomy(`flow cancel ${flow!.flowId}`)
    const [terminalFlow] = await listAutonomyFlows(tempDir)

    expect(result).toContain('already terminal')
    expect(terminalFlow!.status).toBe('succeeded')
  })

  test('invalid subcommands return usage text', async () => {
    const { result } = await callAutonomy('unknown')
    expect(result).toContain('Usage: /autonomy')
  })
})
