import { describe, expect, test } from 'bun:test'
import {
  hasActiveInProcessTeammates,
  hasWorkingInProcessTeammates,
  waitForTeammatesToBecomeIdle,
} from '../teammate.js'

function makeAppState(tasks: Record<string, unknown>) {
  return { tasks } as Parameters<typeof hasActiveInProcessTeammates>[0]
}

describe('teammate task classification', () => {
  test('ignores pane-backed teammates when checking active in-process work', async () => {
    const paneTask = {
      type: 'in_process_teammate',
      status: 'running',
      isIdle: false,
      executionBackend: 'tmux',
    }
    const appState = makeAppState({ pane: paneTask })

    expect(hasActiveInProcessTeammates(appState)).toBe(false)
    expect(hasWorkingInProcessTeammates(appState)).toBe(false)

    let latestState = appState
    await expect(
      waitForTeammatesToBecomeIdle(updater => {
        latestState = updater(latestState)
      }, latestState),
    ).resolves.toBeUndefined()
    expect(latestState.tasks.pane).toMatchObject(paneTask as Record<string, unknown>)
  })

  test('still tracks true in-process teammates', () => {
    const asyncLocalTask = {
      type: 'in_process_teammate',
      status: 'running',
      isIdle: false,
      executionBackend: 'in-process',
    }
    const appState = makeAppState({ teammate: asyncLocalTask })

    expect(hasActiveInProcessTeammates(appState)).toBe(true)
    expect(hasWorkingInProcessTeammates(appState)).toBe(true)
  })
})
