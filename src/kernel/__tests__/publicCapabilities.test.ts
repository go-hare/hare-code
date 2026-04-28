import { describe, expect, test } from 'bun:test'

import { createKernelCompanionRuntime } from '../companion.js'
import { createKernelContextManager } from '../context.js'
import { createKernelKairosRuntime } from '../kairos.js'
import { createKernelMemoryManager } from '../memory.js'
import { createKernelSessionManager } from '../sessions.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'

describe('kernel public capability modules', () => {
  test('companion runtime manages state and emits events', async () => {
    const snapshot = { ...getGlobalConfig() }
    try {
      saveGlobalConfig(current => ({
        ...current,
        userID: 'kernel-public-capability-test',
        oauthAccount: undefined,
        companion: undefined,
        companionMuted: false,
      }))
      const events: string[] = []
      const runtime = createKernelCompanionRuntime({
        generateStoredCompanion: async () => ({
          name: 'Miso',
          personality: 'Warm and tiny.',
          hatchedAt: 123,
        }),
        triggerReaction: (_messages, setReaction) => {
          setReaction('beep')
        },
      })

      const stop = runtime.onEvent(event => {
        events.push(event.type)
      })

      const hatched = await runtime.dispatch({
        type: 'hatch',
        seed: 'local:kernel-public-capability-test',
      })
      expect(hatched?.companion?.name).toBe('Miso')

      const muted = await runtime.dispatch({ type: 'mute' })
      expect(muted?.muted).toBe(true)

      await runtime.dispatch({ type: 'unmute' })
      await runtime.reactToTurn({ messages: [] })
      stop()

      expect(events).toContain('state_changed')
      expect(events).toContain('reaction')
    } finally {
      saveGlobalConfig(() => snapshot)
    }
  })

  test('kairos runtime exposes observable queue and suspension state', async () => {
    const proactive = {
      active: true,
      paused: false,
      contextBlocked: false,
      shouldTick: true,
      nextTickAt: 177,
      activationSource: 'test',
    }
    const runtime = createKernelKairosRuntime({
      isEnabled: () => true,
      isRuntimeEnabled: async () => true,
      getProactiveState: () => proactive,
      pauseProactive: () => {
        proactive.paused = true
        proactive.shouldTick = false
      },
      resumeProactive: () => {
        proactive.paused = false
        proactive.shouldTick = true
      },
      createAutonomyCommands: async request => [
        {
          value: request.basePrompt ?? 'tick',
          mode: 'prompt',
          priority: request.priority,
          workload: request.workload,
          isMeta: true,
        },
      ],
      now: () => '2026-04-28T00:00:00.000Z',
    })

    await runtime.enqueueEvent({ type: 'webhook.received' })
    const enqueuedStatus = await runtime.getStatus()
    expect(enqueuedStatus.pendingEvents).toBe(1)
    expect(enqueuedStatus.proactive?.active).toBe(true)

    await runtime.suspend('tests')
    expect((await runtime.getStatus()).suspended).toBe(true)
    expect((await runtime.getStatus()).proactive?.paused).toBe(true)

    await runtime.resume('tests')
    const events: string[] = []
    const stop = runtime.onEvent(event => {
      events.push(event.type)
      if (event.type === 'tick') {
        expect(event.autonomyCommands).toHaveLength(1)
        expect(event.autonomyCommands?.[0]?.value).toBe('heartbeat')
      }
    })
    await runtime.tick({
      createAutonomyCommands: true,
      basePrompt: 'heartbeat',
      priority: 'next',
      workload: 'kairos-test',
    })
    stop()

    const status = await runtime.getStatus()
    expect(status.pendingEvents).toBe(0)
    expect(status.proactive?.paused).toBe(false)
    expect(status.lastTickAt).toBe('2026-04-28T00:00:00.000Z')
    expect(events).toContain('tick')
  })

  test('memory manager reads and updates via injected seam', async () => {
    const files = new Map([
      [
        '/memory/CLAUDE.md',
        {
          path: '/memory/CLAUDE.md',
          type: 'Project',
          content: 'before',
        },
      ],
    ])

    const manager = createKernelMemoryManager({
      loadFiles: async () => [...files.values()] as never,
      readFile: async path => files.get(path)?.content ?? '',
      writeFile: async (path, content) => {
        const current = files.get(path)
        files.set(path, { ...(current ?? { path, type: 'Project' }), content })
      },
    })

    expect(await manager.list()).toEqual([
      {
        id: '/memory/CLAUDE.md',
        path: '/memory/CLAUDE.md',
        source: 'project',
        bytes: 6,
      },
    ])

    const updated = await manager.update({
      id: '/memory/CLAUDE.md',
      content: 'after',
    })
    expect(updated.content).toBe('after')
  })

  test('context manager exposes context and injection seam', async () => {
    let injection: string | null = null
    const manager = createKernelContextManager({
      getSystem: async () => ({ gitStatus: 'clean' }),
      getUser: async () => ({ claudeMd: 'rules' }),
      getGitStatus: async () => 'clean',
      getSystemPromptInjection: () => injection,
      setSystemPromptInjection: value => {
        injection = value
      },
    })

    expect(await manager.read()).toEqual({
      system: { gitStatus: 'clean' },
      user: { claudeMd: 'rules' },
    })
    manager.setSystemPromptInjection('poke')
    expect(manager.getSystemPromptInjection()).toBe('poke')
  })

  test('session manager lists and loads transcript state', async () => {
    const manager = createKernelSessionManager({
      listSessions: async () => [
        {
          sessionId: 'session-1',
          summary: 'summary',
          lastModified: 1,
        },
      ],
      loadTranscript: async sessionId => ({
        sessionId,
        fullPath: '/sessions/session-1.jsonl',
        messages: [{ type: 'user' }],
        turnInterruptionState: 'none',
      }),
    })

    expect(await manager.list()).toEqual([
      {
        sessionId: 'session-1',
        summary: 'summary',
        lastModified: 1,
      },
    ])
    expect(await manager.getTranscript('session-1')).toEqual({
      sessionId: 'session-1',
      fullPath: '/sessions/session-1.jsonl',
      messages: [{ type: 'user' }],
      turnInterruptionState: 'none',
    })
    expect(await manager.resume('session-1')).toEqual({
      sessionId: 'session-1',
      fullPath: '/sessions/session-1.jsonl',
      messages: [{ type: 'user' }],
      turnInterruptionState: 'none',
    })
  })
})
