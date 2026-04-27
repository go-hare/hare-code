import { describe, expect, mock, test } from 'bun:test'
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import type { ChildProcess } from 'child_process'

import { RuntimeDirectConnectSession } from '../RuntimeDirectConnectSession.js'
import type { KernelRuntimeEnvelopeBase } from '../../../contracts/events.js'

function waitForAsyncIO(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

function createRuntimeHandle() {
  const process = new EventEmitter() as ChildProcess
  const stdout = new PassThrough()
  const stderr = new PassThrough()

  return {
    sessionId: 'session-1',
    workDir: '/tmp/project',
    process,
    stdout,
    stderr,
    writeLine: mock((_data: string) => true),
    terminate: mock(() => {}),
    forceKill: mock(() => {}),
  }
}

function createRuntimeEnvelope(
  sequence = 1,
): KernelRuntimeEnvelopeBase<{ type: string }> {
  return {
    schemaVersion: 'kernel.runtime.v1',
    messageId: `runtime-message-${sequence}`,
    eventId: `runtime-event-${sequence}`,
    sequence,
    timestamp: '2026-04-26T00:00:00.000Z',
    source: 'kernel_runtime',
    kind: 'event',
    conversationId: 'conversation-1',
    payload: { type: 'headless.sdk_message' },
  }
}

describe('RuntimeDirectConnectSession', () => {
  test('replays backlog to newly attached sinks and tracks detached/running status', async () => {
    const runtime = createRuntimeHandle()
    const logger = {
      debug: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
    }
    const onStopped = mock(() => {})
    const socketA = {
      send: mock((_data: string) => {}),
      close: mock((_code?: number, _reason?: string) => {}),
    }
    const socketB = {
      send: mock((_data: string) => {}),
      close: mock((_code?: number, _reason?: string) => {}),
    }

    const session = new RuntimeDirectConnectSession(runtime, logger, 0, onStopped)

    runtime.stdout.write('first line\n')
    await waitForAsyncIO()

    session.attachSink(socketA)
    expect(socketA.send).toHaveBeenCalledWith('first line')
    expect(session.status).toBe('running')

    session.detachSink(socketA)
    expect(session.status).toBe('detached')

    runtime.stdout.write('second line\n')
    await waitForAsyncIO()

    session.attachSink(socketB)
    expect(socketB.send.mock.calls.map(call => call[0])).toEqual([
      'first line',
      'second line',
    ])
    expect(session.status).toBe('running')
  })

  test('indexes kernel runtime envelopes without changing raw backlog replay', async () => {
    const runtime = createRuntimeHandle()
    const logger = {
      debug: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
    }
    const onStopped = mock(() => {})
    const socket = {
      send: mock((_data: string) => {}),
      close: mock((_code?: number, _reason?: string) => {}),
    }
    const eventSink = mock((_envelope: unknown) => {})

    const session = new RuntimeDirectConnectSession(runtime, logger, 0, onStopped)
    const envelope = createRuntimeEnvelope()
    const rawLine = JSON.stringify({
      type: 'kernel_runtime_event',
      uuid: 'wire-message-1',
      session_id: 'session-1',
      envelope,
    })

    runtime.stdout.write(`${rawLine}\n`)
    await waitForAsyncIO()

    expect(session.getRuntimeEnvelopeBacklog()).toEqual([envelope])
    session.replayRuntimeEnvelopeBacklog(eventSink)
    expect(eventSink).toHaveBeenCalledWith(envelope)

    session.attachSink(socket)
    expect(socket.send).toHaveBeenCalledWith(rawLine)
  })

  test('force stop waits for process close and notifies onStopped', async () => {
    const runtime = createRuntimeHandle()
    const logger = {
      debug: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
    }
    const onStopped = mock(() => {})
    const socket = {
      send: mock((_data: string) => {}),
      close: mock((_code?: number, _reason?: string) => {}),
    }

    const session = new RuntimeDirectConnectSession(
      runtime,
      logger,
      0,
      onStopped,
    )
    session.attachSink(socket)

    const stopPromise = session.stopAndWait(true)

    expect(runtime.forceKill).toHaveBeenCalledTimes(1)
    expect(session.status).toBe('stopping')

    runtime.process.emit('close', 0, null)
    await stopPromise

    expect(session.status).toBe('stopped')
    expect(socket.close).toHaveBeenCalledWith(1000, 'Session ended')
    expect(onStopped).toHaveBeenCalledWith(session)
  })

  test('detached sessions honor idle timeout by terminating the runtime', async () => {
    const runtime = createRuntimeHandle()
    const logger = {
      debug: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
    }
    const onStopped = mock(() => {})
    const socket = {
      send: mock((_data: string) => {}),
      close: mock((_code?: number, _reason?: string) => {}),
    }

    const session = new RuntimeDirectConnectSession(
      runtime,
      logger,
      1,
      onStopped,
    )
    session.attachSink(socket)
    session.detachSink(socket)

    await new Promise(resolve => setTimeout(resolve, 10))

    expect(runtime.terminate).toHaveBeenCalledTimes(1)
    runtime.process.emit('close', 0, null)
    await session.closed
    expect(session.status).toBe('stopped')
  })

  test('keeps client-style aliases for existing host callers', () => {
    const runtime = createRuntimeHandle()
    const logger = {
      debug: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
    }
    const onStopped = mock(() => {})
    const sink = {
      send: mock((_data: string) => {}),
      close: mock((_code?: number, _reason?: string) => {}),
    }

    const session = new RuntimeDirectConnectSession(
      runtime,
      logger,
      0,
      onStopped,
    )

    session.attachClient(sink)
    expect(session.handleClientMessage('hello')).toBe(true)
    expect(runtime.writeLine).toHaveBeenCalledWith('hello')
    session.detachClient(sink)
    expect(session.status).toBe('detached')
  })
})
