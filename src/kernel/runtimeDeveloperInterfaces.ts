import type {
  KernelCompanionEvent,
  KernelCompanionRuntime,
} from './companion.js'
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
import { runWithCwdOverride } from '../utils/cwd.js'
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
      return withRuntimeCwd(context, () => manager.resume(sessionId))
    },
    getSessionTranscript(sessionId, context) {
      return withRuntimeCwd(context, () => manager.getTranscript(sessionId))
    },
  }
}
