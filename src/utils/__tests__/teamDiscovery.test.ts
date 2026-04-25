import { afterAll, afterEach, describe, expect, spyOn, test } from 'bun:test'
import * as teamHelpers from '../swarm/teamHelpers.js'

const readTeamFileSpy = spyOn(teamHelpers, 'readTeamFile')
const { getTeammateStatuses } = await import('../teamDiscovery.js')

describe('getTeammateStatuses', () => {
  afterEach(() => {
    readTeamFileSpy.mockReset()
  })

  afterAll(() => {
    readTeamFileSpy.mockRestore()
  })

  test('preserves in-process backend metadata for teammate status views', () => {
    readTeamFileSpy.mockReturnValue({
      members: [
        {
          name: 'team-lead',
          agentId: 'lead-1',
          tmuxPaneId: '%0',
          cwd: 'C:\\repo',
          isActive: true,
        },
        {
          name: 'builder',
          agentId: 'agent-1',
          tmuxPaneId: 'in-process',
          cwd: 'C:\\repo',
          backendType: 'in-process',
          isActive: true,
        },
        {
          name: 'reviewer',
          agentId: 'agent-2',
          tmuxPaneId: '%2',
          cwd: 'C:\\repo',
          backendType: 'tmux',
          isActive: false,
        },
      ],
      hiddenPaneIds: ['%2'],
    } as any)

    const teammates = getTeammateStatuses('team-a')

    expect(teammates).toHaveLength(2)
    expect(teammates[0]).toMatchObject({
      name: 'builder',
      backendType: 'in-process',
      status: 'running',
      isHidden: false,
    })
    expect(teammates[1]).toMatchObject({
      name: 'reviewer',
      backendType: 'tmux',
      status: 'idle',
      isHidden: true,
    })
  })
})
