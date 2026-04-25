import { afterEach, describe, expect, mock, test } from 'bun:test'

const requestShutdownMock = mock(async () => true)
const terminateMock = mock(async () => true)
const createTeammateExecutorForMemberMock = mock((member: any) => {
  if (!member.backendType && member.tmuxPaneId !== 'in-process') {
    return undefined
  }

  return {
    requestShutdown: requestShutdownMock,
    terminate: terminateMock,
    cleanupOrphan: mock(async () => true),
    type: member.backendType ?? 'in-process',
  }
})

mock.module('../backends/executorFacade.js', () => ({
  createTeammateExecutorForMember: createTeammateExecutorForMemberMock,
}))

describe('requestTeammateShutdown', () => {
  afterEach(() => {
    createTeammateExecutorForMemberMock.mockReset()
    requestShutdownMock.mockReset()
    terminateMock.mockReset()
    requestShutdownMock.mockImplementation(async () => true)
    terminateMock.mockImplementation(async () => true)
    createTeammateExecutorForMemberMock.mockImplementation((member: any) => {
      if (!member.backendType && member.tmuxPaneId !== 'in-process') {
        return undefined
      }

      return {
        requestShutdown: requestShutdownMock,
        terminate: terminateMock,
        cleanupOrphan: mock(async () => true),
        type: member.backendType ?? 'in-process',
      }
    })
  })

  test('delegates shutdown requests through the executor facade', async () => {
    const { requestTeammateShutdown } = await import('../teammateLifecycle.js')
    const context = {
      getAppState: () => ({ tasks: {} }),
      setAppState: mock(() => {}),
    } as any
    const member = {
      agentId: 'worker@alpha-team',
      name: 'worker',
      tmuxPaneId: 'in-process',
      backendType: 'in-process',
    } as const

    const result = await requestTeammateShutdown(
      'alpha-team',
      member,
      context,
      'cleanup',
    )

    expect(result).toBe(true)
    expect(createTeammateExecutorForMemberMock).toHaveBeenCalledWith(member)
    expect(requestShutdownMock).toHaveBeenCalledWith(
      'alpha-team',
      member,
      context,
      'cleanup',
    )
  })

  test('returns false when no executor can be resolved', async () => {
    const { requestTeammateShutdown } = await import('../teammateLifecycle.js')

    const result = await requestTeammateShutdown(
      'alpha-team',
      {
        agentId: 'worker@alpha-team',
        name: 'worker',
        tmuxPaneId: '%1',
      },
      {
        getAppState: () => ({ tasks: {} }),
        setAppState: mock(() => {}),
      } as any,
      'cleanup',
    )

    expect(result).toBe(false)
    expect(requestShutdownMock).not.toHaveBeenCalled()
  })
})

describe('terminateTeammate', () => {
  afterEach(() => {
    createTeammateExecutorForMemberMock.mockReset()
    requestShutdownMock.mockReset()
    terminateMock.mockReset()
    requestShutdownMock.mockImplementation(async () => true)
    terminateMock.mockImplementation(async () => true)
    createTeammateExecutorForMemberMock.mockImplementation((member: any) => {
      if (!member.backendType && member.tmuxPaneId !== 'in-process') {
        return undefined
      }

      return {
        requestShutdown: requestShutdownMock,
        terminate: terminateMock,
        cleanupOrphan: mock(async () => true),
        type: member.backendType ?? 'in-process',
      }
    })
  })

  test('delegates termination through the executor facade', async () => {
    const { terminateTeammate } = await import('../teammateLifecycle.js')
    const context = {
      getAppState: () => ({ tasks: {} }),
      setAppState: mock(() => {}),
    } as any
    const member = {
      agentId: 'worker@alpha-team',
      name: 'worker',
      tmuxPaneId: '%1',
      backendType: 'tmux',
    } as const

    const result = await terminateTeammate('alpha-team', member, context)

    expect(result).toBe(true)
    expect(createTeammateExecutorForMemberMock).toHaveBeenCalledWith(member)
    expect(terminateMock).toHaveBeenCalledWith('alpha-team', member, context)
  })

  test('returns false when no executor can be resolved', async () => {
    const { terminateTeammate } = await import('../teammateLifecycle.js')

    const result = await terminateTeammate(
      'alpha-team',
      {
        agentId: 'worker@alpha-team',
        name: 'worker',
        tmuxPaneId: '%1',
      },
      {
        getAppState: () => ({ tasks: {} }),
        setAppState: mock(() => {}),
      } as any,
    )

    expect(result).toBe(false)
    expect(terminateMock).not.toHaveBeenCalled()
  })
})
