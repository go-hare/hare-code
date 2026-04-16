import type {
  GoalInput,
  RuntimeEvent,
  TaskAction,
  TaskControlResult,
  TaskState,
} from '../types/index.js'
import {
  buildTaskTransitionEvent,
  cloneRuntimeTask,
  isVisibleRuntimeTask,
} from './taskHelpers.js'

type TaskRuntimeOptions = {
  emitEvent: (event: RuntimeEvent) => void
}

type ListTaskOptions = {
  includeCompleted?: boolean
}

function createTaskId(counter: number): string {
  return `task_${String(counter).padStart(4, '0')}`
}

export class TaskRuntime {
  readonly #emitEvent: (event: RuntimeEvent) => void
  #tasks = new Map<string, TaskState>()
  #taskCounter = 0
  #activeTaskId?: string

  constructor(options: TaskRuntimeOptions) {
    this.#emitEvent = options.emitEvent
  }

  get activeTaskId(): string | undefined {
    return this.#activeTaskId
  }

  submitGoal(goal: GoalInput, fallbackConversationId?: string): string {
    this.#taskCounter += 1
    const taskId = createTaskId(this.#taskCounter)
    const now = Date.now()
    const task: TaskState = {
      taskId,
      type: 'goal',
      title: goal.goal.slice(0, 80) || taskId,
      description: goal.goal,
      status: 'running',
      priority: goal.priority || 'normal',
      ownerKind: 'coordinator',
      conversationId: goal.conversationId || fallbackConversationId,
      turnId: goal.turnId,
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      metadata: { ...(goal.metadata || {}), source: goal.source || 'host' },
    }

    this.#tasks.set(taskId, task)
    this.#activeTaskId = taskId
    this.#emitEvent({
      type: 'task_started',
      conversationId: task.conversationId,
      turnId: task.turnId,
      taskId,
      title: task.title,
      description: task.description,
      metadata: task.metadata,
    })
    return taskId
  }

  listTasks(options: ListTaskOptions = {}): TaskState[] {
    const includeCompleted = options.includeCompleted ?? false
    return [...this.#tasks.values()]
      .filter(task => isVisibleRuntimeTask(task, includeCompleted))
      .map(task => cloneRuntimeTask(task))
  }

  async controlTask(
    taskId: string,
    action: TaskAction,
  ): Promise<TaskControlResult> {
    const task = this.#tasks.get(taskId)
    if (!task) {
      return this.#reject(taskId, action, 'Task not found')
    }

    task.updatedAt = Date.now()
    const accepted = this.#applyAction(task, action)
    if (!accepted) {
      return this.#reject(taskId, action, 'Unsupported task action')
    }

    return {
      accepted: true,
      taskId,
      action,
      message: 'Task updated',
    }
  }

  upsertTask(task: TaskState): void {
    const nextTask = cloneRuntimeTask(task)
    const previous = this.#tasks.get(task.taskId)
    this.#tasks.set(task.taskId, nextTask)

    if (!previous) {
      if (nextTask.status === 'running') {
        this.#activeTaskId = nextTask.taskId
      }
      this.#emitEvent({
        type: 'task_started',
        taskId: nextTask.taskId,
        conversationId: nextTask.conversationId,
        turnId: nextTask.turnId,
        title: nextTask.title,
        description: nextTask.description,
        metadata: nextTask.metadata,
      })
      return
    }

    if (nextTask.status !== previous.status) {
      if (nextTask.status === 'running') {
        this.#activeTaskId = nextTask.taskId
      }
      if (['completed', 'failed', 'killed', 'cancelled'].includes(nextTask.status)) {
        this.clearActiveTask(nextTask.taskId)
      }
      this.#emitEvent(buildTaskTransitionEvent(previous, nextTask))
      return
    }

    if (nextTask.progress?.summary !== previous.progress?.summary) {
      this.#emitEvent({
        type: 'task_progress',
        taskId: nextTask.taskId,
        conversationId: nextTask.conversationId,
        turnId: nextTask.turnId,
        progressText: nextTask.progress?.summary,
      })
    }
  }

  removeTask(taskId: string): void {
    this.#tasks.delete(taskId)
    this.clearActiveTask(taskId)
  }

  clearActiveTask(taskId?: string): void {
    if (!taskId || this.#activeTaskId === taskId) {
      this.#activeTaskId = undefined
    }
  }

  #applyAction(task: TaskState, action: TaskAction): boolean {
    switch (action) {
      case 'pause':
        this.#pauseTask(task)
        return true
      case 'resume':
        this.#resumeTask(task)
        return true
      case 'stop':
        this.#stopTask(task)
        return true
      case 'retry':
        this.#retryTask(task)
        return true
      case 'promote':
        this.#changePriority(task, 'high', 'Task promoted to high priority')
        return true
      case 'demote':
        this.#changePriority(task, 'low', 'Task demoted to low priority')
        return true
      default:
        return false
    }
  }

  #pauseTask(task: TaskState): void {
    task.status = 'paused'
    this.#emitEvent({
      type: 'task_paused',
      taskId: task.taskId,
      conversationId: task.conversationId,
      turnId: task.turnId,
      reason: 'Paused by host',
    })
  }

  #resumeTask(task: TaskState): void {
    task.status = 'running'
    this.#activeTaskId = task.taskId
    this.#emitEvent({
      type: 'task_resumed',
      taskId: task.taskId,
      conversationId: task.conversationId,
      turnId: task.turnId,
      reason: 'Resumed by host',
    })
  }

  #stopTask(task: TaskState): void {
    task.status = 'killed'
    task.error = 'Stopped by host'
    this.clearActiveTask(task.taskId)
    this.#emitEvent({
      type: 'task_failed',
      taskId: task.taskId,
      conversationId: task.conversationId,
      turnId: task.turnId,
      error: task.error,
    })
  }

  #retryTask(task: TaskState): void {
    task.status = 'running'
    task.error = undefined
    this.#activeTaskId = task.taskId
    this.#emitEvent({
      type: 'task_progress',
      taskId: task.taskId,
      conversationId: task.conversationId,
      turnId: task.turnId,
      progressText: 'Retry requested by host',
    })
  }

  #changePriority(
    task: TaskState,
    priority: TaskState['priority'],
    progressText: string,
  ): void {
    task.priority = priority
    this.#emitEvent({
      type: 'task_progress',
      taskId: task.taskId,
      conversationId: task.conversationId,
      turnId: task.turnId,
      progressText,
    })
  }

  #reject(
    taskId: string,
    action: TaskAction,
    message: string,
  ): TaskControlResult {
    return {
      accepted: false,
      taskId,
      action,
      message,
    }
  }
}
