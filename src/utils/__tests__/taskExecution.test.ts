import { beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  createTask,
  getTask,
  getTaskExecutionMetadata,
  getActiveTaskExecutionContext,
  linkTaskToBackgroundTask,
  markTaskCompletionSuggested,
  runWithActiveTaskExecutionContext,
} from '../tasks.js'

describe('task execution metadata helpers', () => {
  let configDir: string

  beforeEach(async () => {
    configDir = await mkdtemp(join(tmpdir(), 'claude-task-exec-'))
    process.env.CLAUDE_CONFIG_DIR = configDir
  })

  test('links a task to a background task and marks completion suggested', async () => {
    const taskListId = 'task-exec-test'
    const taskId = await createTask(taskListId, {
      subject: 'Test task',
      description: 'Task description',
      status: 'in_progress',
      blocks: [],
      blockedBy: [],
    })

    await linkTaskToBackgroundTask(taskListId, taskId, {
      backgroundTaskId: 'a123',
      backgroundTaskType: 'local_agent',
      agentId: 'a123',
    })

    let task = await getTask(taskListId, taskId)
    expect(task).toBeTruthy()
    expect(getTaskExecutionMetadata(task!)).toEqual({
      linkedBackgroundTaskId: 'a123',
      linkedBackgroundTaskType: 'local_agent',
      linkedAgentId: 'a123',
      completionSuggestedAt: undefined,
      completionSuggestedByBackgroundTaskId: undefined,
    })

    const suggested = await markTaskCompletionSuggested(taskListId, taskId, 'a123')
    expect(suggested).toBe(true)

    task = await getTask(taskListId, taskId)
    const metadata = getTaskExecutionMetadata(task!)
    expect(metadata?.completionSuggestedByBackgroundTaskId).toBe('a123')
    expect(typeof metadata?.completionSuggestedAt).toBe('string')

    await rm(configDir, { recursive: true, force: true })
  })

  test('does not mark completion suggested for a different background task', async () => {
    const taskListId = 'task-exec-test-2'
    const taskId = await createTask(taskListId, {
      subject: 'Test task',
      description: 'Task description',
      status: 'in_progress',
      blocks: [],
      blockedBy: [],
    })

    await linkTaskToBackgroundTask(taskListId, taskId, {
      backgroundTaskId: 'a123',
      backgroundTaskType: 'local_agent',
    })

    const suggested = await markTaskCompletionSuggested(taskListId, taskId, 'other')
    expect(suggested).toBe(false)

    const task = await getTask(taskListId, taskId)
    const metadata = getTaskExecutionMetadata(task!)
    expect(metadata?.completionSuggestedByBackgroundTaskId).toBeUndefined()

    await rm(configDir, { recursive: true, force: true })
  })

  test('marks completion suggestion only once per linked background task', async () => {
    const taskListId = 'task-exec-test-3'
    const taskId = await createTask(taskListId, {
      subject: 'Test task',
      description: 'Task description',
      status: 'in_progress',
      blocks: [],
      blockedBy: [],
    })

    await linkTaskToBackgroundTask(taskListId, taskId, {
      backgroundTaskId: 'a123',
      backgroundTaskType: 'local_agent',
    })

    expect(await markTaskCompletionSuggested(taskListId, taskId, 'a123')).toBe(true)
    expect(await markTaskCompletionSuggested(taskListId, taskId, 'a123')).toBe(false)

    const task = await getTask(taskListId, taskId)
    const metadata = getTaskExecutionMetadata(task!)
    expect(metadata?.completionSuggestedByBackgroundTaskId).toBe('a123')

    await rm(configDir, { recursive: true, force: true })
  })

  test('isolates active task execution context per async chain', async () => {
    const result = await Promise.all([
      runWithActiveTaskExecutionContext(
        { taskListId: 'list-a', taskId: '1' },
        async () => {
          await Promise.resolve()
          return getActiveTaskExecutionContext()
        },
      ),
      runWithActiveTaskExecutionContext(
        { taskListId: 'list-b', taskId: '2' },
        async () => {
          await Promise.resolve()
          return getActiveTaskExecutionContext()
        },
      ),
    ])

    expect(result).toEqual([
      { taskListId: 'list-a', taskId: '1' },
      { taskListId: 'list-b', taskId: '2' },
    ])
    expect(getActiveTaskExecutionContext()).toBeUndefined()
  })
})
