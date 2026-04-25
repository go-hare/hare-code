import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PaneBackend } from '../types.js'

const registerTaskMock = mock(() => {})
const updateTaskStateMock = mock(() => {})
const spawnInProcessTeammateMock = mock(async () => ({
  success: true,
  taskId: 'task-1',
  teammateContext: { parentSessionId: 'parent-session' },
  abortController: new AbortController(),
}))
const startInProcessTeammateMock = mock(() => {})
const killInProcessTeammateMock = mock(async () => true)
const findTeammateTaskByAgentIdMock = mock(() => null)
const requestTeammateShutdownMock = mock(() => {})

mock.module('src/utils/task/framework.js', () => ({
  POLL_INTERVAL_MS: 1000,
  STOPPED_DISPLAY_MS: 3000,
  PANEL_GRACE_MS: 30000,
  registerTask: registerTaskMock,
  updateTaskState: updateTaskStateMock,
  evictTerminalTask: mock(() => {}),
  getRunningTasks: mock(() => []),
  generateTaskAttachments: mock(async () => ({
    attachments: [],
    newMessagesCount: 0,
  })),
  applyTaskOffsetsAndEvictions: mock(state => state),
  pollTasks: mock(async () => {}),
}))
mock.module('src/utils/swarm/inProcessRunner.js', () => ({
  startInProcessTeammate: startInProcessTeammateMock,
}))
mock.module('src/utils/swarm/spawnInProcess.js', () => ({
  spawnInProcessTeammate: spawnInProcessTeammateMock,
  killInProcessTeammate: killInProcessTeammateMock,
}))
mock.module('src/tasks/InProcessTeammateTask/InProcessTeammateTask.js', () => ({
  InProcessTeammateTask: {
    name: 'InProcessTeammateTask',
    type: 'in_process_teammate',
    kill: mock(async () => {}),
  },
  findTeammateTaskByAgentId: findTeammateTaskByAgentIdMock,
  requestTeammateShutdown: requestTeammateShutdownMock,
  appendTeammateMessage: mock(() => {}),
  injectUserMessageToTeammate: mock(() => true),
  deliverUserMessageToTeammate: mock(async () => true),
  getAllInProcessTeammateTasks: mock(() => []),
  getRunningTeammatesSorted: mock(() => []),
}))
mock.module('src/utils/swarm/spawnUtils.js', () => ({
  buildInheritedCliArgParts: mock((options?: { permissionMode?: string }) => {
    const flags = ['--teammate-mode', 'auto']
    if (options?.permissionMode === 'auto') {
      flags.unshift('--permission-mode', 'auto')
    }
    return flags
  }),
  buildInheritedEnvVars: () => 'CLAUDECODE=1',
  getInheritedEnvVarAssignments: () => [['CLAUDECODE', '1']],
}))
mock.module('../detection.js', () => ({
  isInsideTmux: mock(async () => false),
  isInsideTmuxSync: mock(() => false),
  isTmuxAvailable: mock(async () => true),
  isIt2CliAvailable: mock(async () => false),
  isWindowsTerminalAvailable: mock(async () => false),
  isInITerm2: mock(() => false),
  isInWindowsTerminal: mock(() => false),
}))
mock.module('../registry.js', () => ({
  ensureBackendsRegistered: mock(async () => {}),
  detectAndGetBackend: mock(async () => ({
    backend: null,
    isNative: false,
    needsIt2Setup: false,
  })),
  getBackendByType: mock((_type: string) => {
    throw new Error('unexpected backend lookup')
  }),
  getCachedBackend: mock(() => null),
  getCachedDetectionResult: mock(() => null),
  markInProcessFallback: mock(() => {}),
  isInProcessEnabled: mock(() => false),
  getResolvedTeammateMode: mock(() => 'tmux'),
  resetBackendDetection: mock(() => {}),
}))

let tempHome: string
let previousConfigDir: string | undefined

beforeEach(() => {
  previousConfigDir = process.env.CLAUDE_CONFIG_DIR
  tempHome = mkdtempSync(join(tmpdir(), 'executor-facade-'))
  process.env.CLAUDE_CONFIG_DIR = tempHome
})

afterEach(async () => {
  if (previousConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = previousConfigDir
  }

  rmSync(tempHome, { recursive: true, force: true })

  registerTaskMock.mockClear()
  updateTaskStateMock.mockClear()
  spawnInProcessTeammateMock.mockClear()
  startInProcessTeammateMock.mockClear()
  killInProcessTeammateMock.mockClear()
  findTeammateTaskByAgentIdMock.mockClear()
  requestTeammateShutdownMock.mockClear()

  const mod = await import(`../executorFacade.ts?reset=${Math.random()}`)
  mod.resetTrackedPaneCleanupForTesting()
})

function createContext() {
  return {
    options: {
      agentDefinitions: {
        allAgents: [],
        activeAgents: [],
      },
    },
    setAppState: mock(() => {}),
    toolUseId: 'tool-use-1',
  } as any
}

describe('executorFacade', () => {
  test('spawns pane teammates with agent type and inherited auto permission mode', async () => {
    let sentCommand = ''
    const backend: PaneBackend = {
      type: 'tmux',
      displayName: 'tmux',
      supportsHideShow: true,
      async isAvailable() {
        return true
      },
      async isRunningInside() {
        return false
      },
      async createTeammatePaneInSwarmView() {
        return { paneId: '%1', isFirstTeammate: false }
      },
      async sendCommandToPane(_paneId, command) {
        sentCommand = command
      },
      async setPaneBorderColor() {},
      async setPaneTitle() {},
      async enablePaneBorderStatus() {},
      async rebalancePanes() {},
      async killPane() {
        return true
      },
      async hidePane() {
        return true
      },
      async showPane() {
        return true
      },
    }

    const {
      createPaneTeammateExecutor,
      resetTrackedPaneCleanupForTesting,
    } = await import(`../executorFacade.ts?case=${Math.random()}`)
    const executor = createPaneTeammateExecutor(backend)
    const result = await executor.spawn!(
      {
        teammateId: 'reviewer@alpha',
        sanitizedName: 'reviewer',
        teamName: 'alpha',
        prompt: 'review the change',
        cwd: tempHome,
        teammateColor: 'blue',
        agentType: 'code-reviewer',
        permissionMode: 'auto',
        useSplitPane: true,
      },
      createContext(),
    )

    expect(result.backendType).toBe('tmux')
    expect(result.paneId).toBe('%1')
    expect(sentCommand).toContain('--agent-type')
    expect(sentCommand).toContain('code-reviewer')
    expect(sentCommand).toContain('--permission-mode')
    expect(sentCommand).toContain('auto')
    expect(registerTaskMock).toHaveBeenCalledTimes(1)

    resetTrackedPaneCleanupForTesting()
  })

  test('preserves separate-window spawning when useSplitPane is false', async () => {
    let paneSpawned = false
    let windowSpawned = false
    const backend: PaneBackend = {
      type: 'tmux',
      displayName: 'tmux',
      supportsHideShow: true,
      async isAvailable() {
        return true
      },
      async isRunningInside() {
        return false
      },
      async createTeammatePaneInSwarmView() {
        paneSpawned = true
        return { paneId: '%pane', isFirstTeammate: false }
      },
      async createTeammateWindowInSwarmView() {
        windowSpawned = true
        return {
          paneId: '%window',
          windowName: 'teammate-worker',
          isFirstTeammate: false,
        }
      },
      async sendCommandToPane() {},
      async setPaneBorderColor() {},
      async setPaneTitle() {},
      async enablePaneBorderStatus() {},
      async rebalancePanes() {},
      async killPane() {
        return true
      },
      async hidePane() {
        return true
      },
      async showPane() {
        return true
      },
    }

    const {
      createPaneTeammateExecutor,
      resetTrackedPaneCleanupForTesting,
    } = await import(`../executorFacade.ts?case=${Math.random()}`)
    const executor = createPaneTeammateExecutor(backend)
    const result = await executor.spawn!(
      {
        teammateId: 'worker@alpha',
        sanitizedName: 'worker',
        teamName: 'alpha',
        prompt: 'do work',
        cwd: tempHome,
        teammateColor: 'green',
        useSplitPane: false,
      },
      createContext(),
    )

    expect(paneSpawned).toBe(false)
    expect(windowSpawned).toBe(true)
    expect(result.paneId).toBe('%window')
    expect(result.windowName).toBe('teammate-worker')
    expect(result.isSplitPane).toBe(false)

    resetTrackedPaneCleanupForTesting()
  })

  test('resolves executor type from teammate membership data', async () => {
    const { createTeammateExecutorForMember } = await import(
      `../executorFacade.ts?case=${Math.random()}`
    )

    expect(
      createTeammateExecutorForMember({
        agentId: 'lead@alpha',
        name: 'lead',
        tmuxPaneId: 'in-process',
      }),
    )?.toMatchObject({ type: 'in-process' })

    expect(
      createTeammateExecutorForMember({
        agentId: 'worker@alpha',
        name: 'worker',
        tmuxPaneId: '%1',
        backendType: 'tmux',
      }),
    )?.toMatchObject({ type: 'tmux' })

    expect(
      createTeammateExecutorForMember({
        agentId: 'legacy@alpha',
        name: 'legacy',
        tmuxPaneId: '%2',
      }),
    ).toBeUndefined()
  })

  test('marks pane teammates as stopping after graceful shutdown request', async () => {
    findTeammateTaskByAgentIdMock.mockReturnValue({
      id: 'task-pane-1',
      shutdownRequested: false,
    })

    const { createPaneTeammateExecutor } = await import(
      `../executorFacade.ts?case=${Math.random()}`
    )
    const executor = createPaneTeammateExecutor('tmux')
    const context = {
      getAppState: () => ({ tasks: {} }),
      setAppState: mock(() => {}),
    }
    const { readMailbox } = await import('src/utils/teammateMailbox.js')

    const result = await executor.requestShutdown(
      'alpha',
      {
        agentId: 'worker@alpha',
        name: 'worker',
        tmuxPaneId: '%1',
        backendType: 'tmux',
      },
      context,
      'graceful shutdown',
    )

    expect(result).toBe(true)
    expect(requestTeammateShutdownMock).toHaveBeenCalledWith(
      'task-pane-1',
      context.setAppState,
    )
    const inbox = await readMailbox('worker', 'alpha')
    expect(inbox).toHaveLength(1)
    expect(inbox[0]?.text).toContain('"type":"shutdown_request"')
  })

  test('does not resend graceful shutdown for pane teammates already stopping', async () => {
    findTeammateTaskByAgentIdMock.mockReturnValue({
      id: 'task-pane-1',
      shutdownRequested: true,
    })

    const { createPaneTeammateExecutor } = await import(
      `../executorFacade.ts?case=${Math.random()}`
    )
    const executor = createPaneTeammateExecutor('tmux')
    const { readMailbox } = await import('src/utils/teammateMailbox.js')

    const result = await executor.requestShutdown(
      'alpha',
      {
        agentId: 'worker@alpha',
        name: 'worker',
        tmuxPaneId: '%1',
        backendType: 'tmux',
      },
      {
        getAppState: () => ({ tasks: {} }),
        setAppState: mock(() => {}),
      },
      'graceful shutdown',
    )

    expect(result).toBe(true)
    expect(requestTeammateShutdownMock).not.toHaveBeenCalled()
    expect(await readMailbox('worker', 'alpha')).toEqual([])
  })
})
