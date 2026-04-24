import { afterEach, describe, expect, mock, test } from 'bun:test'

const hidePaneMock = mock(async () => true)
const showPaneMock = mock(async () => true)
const execFileNoThrowMock = mock(async () => ({ code: 0, stdout: '', stderr: '' }))
const execFileNoThrowWithCwdMock = mock(async () => ({
  code: 0,
  stdout: '',
  stderr: '',
}))
const addHiddenPaneIdMock = mock(() => true)
const removeHiddenPaneIdMock = mock(() => true)
const ensureBackendsRegisteredMock = mock(async () => {})
const isInsideTmuxSyncMock = mock(() => false)

mock.module('../../../utils/swarm/backends/registry.js', () => ({
  ensureBackendsRegistered: ensureBackendsRegisteredMock,
  getBackendByType: () => ({
    hidePane: hidePaneMock,
    showPane: showPaneMock,
  }),
  getCachedBackend: () => null,
  detectAndGetBackend: mock(async () => ({
    backend: {
      hidePane: hidePaneMock,
      showPane: showPaneMock,
      supportsHideShow: true,
    },
    isNative: false,
    needsIt2Setup: false,
  })),
  getCachedDetectionResult: mock(() => null),
  markInProcessFallback: mock(() => {}),
  isInProcessEnabled: mock(() => false),
  getResolvedTeammateMode: mock(() => 'tmux'),
  getInProcessBackend: mock(() => null),
  getTeammateExecutor: mock(async () => null),
  resetBackendDetection: mock(() => {}),
}))

mock.module('../../../utils/swarm/backends/detection.js', () => ({
  IT2_COMMAND: 'it2',
  TMUX_COMMAND: 'tmux',
  isInsideTmuxSync: isInsideTmuxSyncMock,
  isInsideTmux: mock(async () => false),
  isInITerm2: mock(() => false),
  isInWindowsTerminal: mock(() => false),
  isIt2CliAvailable: mock(async () => false),
  isWindowsTerminalAvailable: mock(async () => true),
  isTmuxAvailable: mock(async () => true),
}))

mock.module('../../../utils/execFileNoThrow.js', () => ({
  execFileNoThrow: execFileNoThrowMock,
  execFileNoThrowWithCwd: execFileNoThrowWithCwdMock,
  execSyncWithDefaults_DEPRECATED: mock(() => ({ stdout: '', stderr: '', code: 0 })),
}))

mock.module('../../../utils/swarm/teamHelpers.js', () => ({
  addHiddenPaneId: addHiddenPaneIdMock,
  removeHiddenPaneId: removeHiddenPaneIdMock,
  removeMemberFromTeam: mock(() => true),
  removeMemberByAgentId: mock(() => true),
  removeTeammateFromTeamFile: mock(() => true),
  setMemberMode: mock(() => true),
  setMultipleMemberModes: mock(() => true),
  syncTeammateMode: mock(() => {}),
  readTeamFile: mock(() => null),
  readTeamFileAsync: mock(async () => null),
  writeTeamFileAsync: mock(async () => {}),
  getTeamDir: mock(() => '/tmp/team'),
  getTeamFilePath: mock(() => '/tmp/team/config.json'),
  sanitizeName: mock((value: string) => value),
  sanitizeAgentName: mock((value: string) => value),
}))

describe('TeamsDialog helpers', () => {
  afterEach(() => {
    hidePaneMock.mockClear()
    showPaneMock.mockClear()
    execFileNoThrowMock.mockClear()
    execFileNoThrowWithCwdMock.mockClear()
    addHiddenPaneIdMock.mockClear()
    removeHiddenPaneIdMock.mockClear()
    ensureBackendsRegisteredMock.mockClear()
    isInsideTmuxSyncMock.mockReset()
    isInsideTmuxSyncMock.mockImplementation(() => false)
  })

  test('viewTeammateOutput returns a user-visible notice for Windows Terminal', async () => {
    const { viewTeammateOutput } = await import('../TeamsDialog.js')

    await expect(
      viewTeammateOutput('pane-1', 'windows-terminal'),
    ).resolves.toContain('Windows Terminal cannot focus teammate output automatically yet')
    expect(execFileNoThrowMock).not.toHaveBeenCalled()
  })

  test('hideTeammate uses the backend and records the pane as hidden', async () => {
    const { hideTeammate } = await import('../TeamsDialog.js')

    await hideTeammate(
      {
        name: 'alice',
        agentId: 'a1',
        status: 'running',
        tmuxPaneId: '%12',
        cwd: '/tmp',
        backendType: 'tmux',
      },
      'team-a',
    )

    expect(ensureBackendsRegisteredMock).toHaveBeenCalled()
    expect(hidePaneMock).toHaveBeenCalledWith('%12', true)
    expect(addHiddenPaneIdMock).toHaveBeenCalledWith('team-a', '%12')
  })

  test('showTeammate uses the backend and removes the hidden marker', async () => {
    const { showTeammate } = await import('../TeamsDialog.js')

    await showTeammate(
      {
        name: 'alice',
        agentId: 'a1',
        status: 'idle',
        tmuxPaneId: '%12',
        cwd: '/tmp',
        backendType: 'tmux',
      },
      'team-a',
    )

    expect(ensureBackendsRegisteredMock).toHaveBeenCalled()
    expect(showPaneMock).toHaveBeenCalledWith('%12', '%12', true)
    expect(removeHiddenPaneIdMock).toHaveBeenCalledWith('team-a', '%12')
  })
})
