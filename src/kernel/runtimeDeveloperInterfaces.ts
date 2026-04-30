import type {
  KernelCompanionEvent,
  KernelCompanionRuntime,
} from './companion.js'
import type {
  RuntimeTaskDescriptor,
  RuntimeTaskExecutionMetadata,
  RuntimeTaskListSnapshot,
} from '../runtime/contracts/task.js'
import type {
  KernelKairosEvent,
  KernelKairosRuntime,
} from './kairos.js'
import type {
  KernelRuntimeWireCompanionRuntime,
  KernelRuntimeWireContextManager,
  KernelRuntimeWireKairosRuntime,
  KernelRuntimeWireMemoryManager,
  KernelRuntimeWireRequestContext,
  KernelRuntimeWireSessionManager,
} from '../runtime/core/wire/KernelRuntimeWireRouter.js'
import type { KernelRuntimeSessionTranscript } from '../runtime/contracts/wire.js'
import type { LogOption } from '../types/logs.js'
import type { Message } from '../types/message.js'
import { runWithCwdOverride } from '../utils/cwd.js'
import { loadMessagesFromJsonlPath } from '../utils/conversationRecovery.js'
import { extractLoadedNestedMemoryPathsFromMessages } from '../utils/queryHelpers.js'
import { getLastSessionLog, loadFullLog } from '../utils/sessionStorage.js'
import { extractTodoSnapshotFromMessages } from '../utils/todo/sessionTodoState.js'
import { createKernelCompanionRuntime } from './companion.js'
import { createKernelContextManager } from './context.js'
import { createKernelKairosRuntime } from './kairos.js'
import { createKernelMemoryManager } from './memory.js'
import { createKernelSessionManager } from './sessions.js'

function withRuntimeCwd<T>(
  context: KernelRuntimeWireRequestContext | undefined,
  fn: () => Promise<T> | T,
): Promise<T> | T {
  const cwd = context?.cwd
  return cwd ? runWithCwdOverride(cwd, fn) : fn()
}

export function createDefaultKernelRuntimeCompanionRuntime(): KernelRuntimeWireCompanionRuntime {
  const runtime: KernelCompanionRuntime = createKernelCompanionRuntime()
  return {
    getState() {
      return runtime.getState()
    },
    dispatch(action) {
      return runtime.dispatch(action)
    },
    reactToTurn(request) {
      return runtime.reactToTurn(request)
    },
    onEvent(handler: (event: KernelCompanionEvent) => void) {
      return runtime.onEvent(handler)
    },
  }
}

export function createDefaultKernelRuntimeKairosRuntime(): KernelRuntimeWireKairosRuntime {
  const runtime: KernelKairosRuntime = createKernelKairosRuntime()
  return {
    getStatus() {
      return runtime.getStatus()
    },
    enqueueEvent(event) {
      return runtime.enqueueEvent(event)
    },
    tick(request) {
      return runtime.tick(request)
    },
    suspend(reason) {
      return runtime.suspend(reason)
    },
    resume(reason) {
      return runtime.resume(reason)
    },
    onEvent(handler: (event: KernelKairosEvent) => void) {
      return runtime.onEvent(handler)
    },
  }
}

export function createDefaultKernelRuntimeMemoryManager(): KernelRuntimeWireMemoryManager {
  const manager = createKernelMemoryManager()
  return {
    listMemory(context) {
      return withRuntimeCwd(context, () => manager.list())
    },
    readMemory(id, context) {
      return withRuntimeCwd(context, () => manager.read(id))
    },
    updateMemory(request, context) {
      return withRuntimeCwd(context, () => manager.update(request))
    },
  }
}

export function createDefaultKernelRuntimeContextManager(): KernelRuntimeWireContextManager {
  const manager = createKernelContextManager()
  return {
    readContext(context) {
      return withRuntimeCwd(context, () => manager.read())
    },
    getGitStatus(context) {
      return withRuntimeCwd(context, () => manager.getGitStatus())
    },
    getSystemPromptInjection(context) {
      return withRuntimeCwd(context, () =>
        manager.getSystemPromptInjection(),
      )
    },
    setSystemPromptInjection(value, context) {
      return withRuntimeCwd(context, () => {
        manager.setSystemPromptInjection(value)
        return manager.getSystemPromptInjection()
      })
    },
  }
}

export function createDefaultKernelRuntimeSessionManager(): KernelRuntimeWireSessionManager {
  const manager = createKernelSessionManager()
  return {
    listSessions(filter = {}, context) {
      return withRuntimeCwd(context, () =>
        manager.list({
          ...filter,
          cwd: filter.cwd ?? context?.cwd,
        }),
      )
    },
    resumeSession(sessionId, context) {
      return withRuntimeCwd(context, () => loadRuntimeSessionTranscript(sessionId))
    },
    getSessionTranscript(sessionId, context) {
      return withRuntimeCwd(context, () => loadRuntimeSessionTranscript(sessionId))
    },
  }
}

type RuntimeResumeSessionTranscript = KernelRuntimeSessionTranscript & {
  taskSnapshot?: unknown
  todoSnapshot?: unknown
  nestedMemorySnapshot?: unknown
  attributionSnapshots?: readonly unknown[]
  fileHistorySnapshots?: readonly unknown[]
  contentReplacements?: readonly unknown[]
  contextCollapseCommits?: readonly unknown[]
  contextCollapseSnapshot?: unknown
}

async function loadRuntimeSessionTranscript(
  sessionId: string,
): Promise<RuntimeResumeSessionTranscript> {
  if (sessionId.endsWith('.jsonl')) {
    return loadRuntimeSessionTranscriptFromPath(sessionId)
  }

  const log = await getLastSessionLog(sessionId as never)
  if (!log) {
    throw new Error(`Unknown session: ${sessionId}`)
  }

  return await toRuntimeResumeSessionTranscript(log, sessionId)
}

async function loadRuntimeSessionTranscriptFromPath(
  sessionPath: string,
): Promise<RuntimeResumeSessionTranscript> {
  const transcript = await loadMessagesFromJsonlPath(sessionPath)
  const log = await loadFullLog(
    createSyntheticLiteLog(sessionPath, transcript.sessionId),
  )
  const todoSnapshot = extractTodoSnapshotFromMessages(transcript.messages)
  const nestedMemorySnapshotFromTranscript = buildRuntimeNestedMemorySnapshot(
    transcript.messages,
  )
  const taskSnapshot = await loadRuntimeTaskSnapshot({
    sessionId: transcript.sessionId,
    messages: transcript.messages,
  })

  if (log.messages.length === 0) {
    return {
      sessionId: transcript.sessionId,
      fullPath: sessionPath,
      messages: transcript.messages,
      turnInterruptionState: 'none',
      taskSnapshot,
      todoSnapshot,
      nestedMemorySnapshot: nestedMemorySnapshotFromTranscript,
    }
  }

  const resumedTranscript = await toRuntimeResumeSessionTranscript(
    log,
    transcript.sessionId ?? sessionPath,
  )
  return {
    ...resumedTranscript,
    nestedMemorySnapshot:
      resumedTranscript.nestedMemorySnapshot ??
      nestedMemorySnapshotFromTranscript,
  }
}

async function toRuntimeResumeSessionTranscript(
  log: Pick<
    LogOption,
    | 'customTitle'
    | 'contentReplacements'
    | 'contextCollapseCommits'
    | 'contextCollapseSnapshot'
    | 'attributionSnapshots'
    | 'fileHistorySnapshots'
    | 'fullPath'
    | 'messages'
    | 'mode'
    | 'sessionId'
    | 'summary'
    | 'teamName'
    | 'tag'
  >,
  fallbackSessionId?: string,
): Promise<RuntimeResumeSessionTranscript> {
  const todoSnapshot = extractTodoSnapshotFromMessages(log.messages)
  const nestedMemorySnapshot = buildRuntimeNestedMemorySnapshot(log.messages)
  const taskSnapshot = await loadRuntimeTaskSnapshot({
    sessionId: log.sessionId ?? fallbackSessionId,
    teamName: log.teamName,
    messages: log.messages,
  })
  return {
    sessionId: log.sessionId ?? fallbackSessionId,
    fullPath: log.fullPath,
    messages: log.messages,
    customTitle: log.customTitle,
    summary: log.summary,
    tag: log.tag,
    mode: log.mode,
    turnInterruptionState: 'none',
    taskSnapshot,
    todoSnapshot,
    nestedMemorySnapshot,
    attributionSnapshots: log.attributionSnapshots,
    fileHistorySnapshots: log.fileHistorySnapshots,
    contentReplacements: log.contentReplacements,
    contextCollapseCommits: log.contextCollapseCommits,
    contextCollapseSnapshot: log.contextCollapseSnapshot,
  }
}

function createSyntheticLiteLog(
  sessionPath: string,
  sessionId: string | undefined,
): LogOption {
  const placeholderDate = new Date(0)
  return {
    date: placeholderDate.toISOString(),
    messages: [],
    fullPath: sessionPath,
    value: 0,
    created: placeholderDate,
    modified: placeholderDate,
    firstPrompt: '',
    messageCount: 0,
    isSidechain: false,
    isLite: true,
    sessionId,
  }
}

function buildRuntimeNestedMemorySnapshot(
  messages: readonly unknown[],
): { paths: readonly string[] } | undefined {
  const loadedPaths = extractLoadedNestedMemoryPathsFromMessages(
    messages as Message[],
  )
  if (loadedPaths.size === 0) {
    return undefined
  }
  return {
    paths: Array.from(loadedPaths),
  }
}

async function loadRuntimeTaskSnapshot(options: {
  sessionId?: string
  teamName?: string
  messages: readonly unknown[]
}): Promise<RuntimeTaskListSnapshot | undefined> {
  const taskListId = resolveResumeTaskListId(options)
  if (!taskListId) {
    return undefined
  }

  const { listTasks } = await import('../utils/tasks.js')
  const tasks = await listTasks(taskListId)
  return {
    taskListId,
    tasks: tasks
      .filter(task => task.metadata?._internal !== true)
      .map(task => toRuntimeTaskDescriptor(taskListId, task)),
  }
}

function resolveResumeTaskListId(options: {
  sessionId?: string
  teamName?: string
  messages: readonly unknown[]
}): string | undefined {
  const teamName =
    normalizeResumeTeamName(options.teamName) ??
    extractResumeTeamNameFromMessages(options.messages)
  if (teamName) {
    return sanitizeResumeTaskListId(teamName)
  }

  const sessionId = options.sessionId?.trim()
  return sessionId ? sessionId : undefined
}

function normalizeResumeTeamName(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined
}

function extractResumeTeamNameFromMessages(
  messages: readonly unknown[],
): string | undefined {
  for (const message of messages) {
    if (!message || typeof message !== 'object') {
      continue
    }
    const teamName = normalizeResumeTeamName(
      (message as { teamName?: unknown }).teamName,
    )
    if (teamName) {
      return teamName
    }
  }
  return undefined
}

function sanitizeResumeTaskListId(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
}

function toRuntimeTaskDescriptor(
  taskListId: string,
  task: {
    id: string
    subject: string
    description: string
    status: RuntimeTaskDescriptor['status']
    activeForm?: string
    owner?: string
    blocks: readonly string[]
    blockedBy: readonly string[]
    metadata?: Record<string, unknown>
  },
): RuntimeTaskDescriptor {
  return {
    id: task.id,
    subject: task.subject,
    description: task.description,
    status: task.status,
    taskListId,
    activeForm: task.activeForm,
    owner: task.owner,
    blocks: task.blocks,
    blockedBy: task.blockedBy,
    ownedFiles: getRuntimeTaskOwnedFiles(task.metadata),
    execution: getRuntimeTaskExecutionMetadata(task.metadata),
  }
}

function getRuntimeTaskOwnedFiles(
  metadata: Record<string, unknown> | undefined,
): readonly string[] | undefined {
  const value = metadata?.ownedFiles
  if (!Array.isArray(value)) {
    return undefined
  }
  const ownedFiles = value.filter(
    (candidate): candidate is string =>
      typeof candidate === 'string' && candidate.trim().length > 0,
  )
  return ownedFiles.length > 0 ? Array.from(new Set(ownedFiles)) : undefined
}

function getRuntimeTaskExecutionMetadata(
  metadata: Record<string, unknown> | undefined,
): RuntimeTaskExecutionMetadata | undefined {
  const value = metadata?.taskExecution
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const candidate = value as Record<string, unknown>
  const execution: RuntimeTaskExecutionMetadata = {
    linkedBackgroundTaskId: asNonEmptyString(
      candidate.linkedBackgroundTaskId,
    ),
    linkedBackgroundTaskType: asNonEmptyString(
      candidate.linkedBackgroundTaskType,
    ),
    linkedAgentId: asNonEmptyString(candidate.linkedAgentId),
    completionSuggestedAt: asNonEmptyString(
      candidate.completionSuggestedAt,
    ),
    completionSuggestedByBackgroundTaskId: asNonEmptyString(
      candidate.completionSuggestedByBackgroundTaskId,
    ),
  }
  return Object.values(execution).some(value => value !== undefined)
    ? execution
    : undefined
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
