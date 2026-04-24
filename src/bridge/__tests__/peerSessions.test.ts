import { describe, expect, mock, test } from 'bun:test'

const mockSendEventToRemoteSession = mock(async () => true)

mock.module('../../utils/teleport/api.js', () => ({
  sendEventToRemoteSession: mockSendEventToRemoteSession,
}))

import {
  buildPeerSessions,
  postInterClaudeMessage,
} from '../peerSessions.js'

describe('buildPeerSessions', () => {
  test('merges uds and bridge entries for the same session and prefers uds delivery', async () => {
    const peers = await buildPeerSessions(
      [
        {
          pid: 2001,
          sessionId: 'session-alpha',
          cwd: 'D:\\workspace\\alpha',
          updatedAt: 300,
          startedAt: 100,
          status: 'waiting',
          waitingFor: 'user_input',
          name: 'Alpha',
          messagingSocketPath: '\\\\.\\pipe\\alpha-live',
        },
        {
          pid: 2001,
          sessionId: 'session-alpha',
          cwd: 'D:\\workspace\\alpha',
          updatedAt: 250,
          startedAt: 90,
          bridgeSessionId: 'session_bridge_alpha',
        },
      ],
      {
        currentPid: 9999,
        currentSessionId: 'session-self',
        currentBridgeSessionId: 'session_bridge_self',
        currentCwd: 'D:\\workspace\\self',
        probeSocket: async socketPath => socketPath === '\\\\.\\pipe\\alpha-live',
      },
    )

    expect(peers).toHaveLength(1)
    expect(peers[0]).toMatchObject({
      id: 'session-alpha',
      sessionId: 'session-alpha',
      displayName: 'Alpha',
      status: 'waiting',
      statusDetail: 'user_input',
      preferredAddress: 'uds:\\\\.\\pipe\\alpha-live',
      transports: ['bridge', 'uds'],
      isSelf: false,
      source: 'local_registry',
      canReceiveStructuredMessages: false,
    })
    expect(peers[0]?.alternateAddresses).toEqual([
      'bridge:session_bridge_alpha',
    ])
  })

  test('sorts self first and keeps bridge-only peers when their uds socket is unreachable', async () => {
    const peers = await buildPeerSessions(
      [
        {
          pid: 3001,
          sessionId: 'session-self',
          cwd: 'D:\\workspace\\repo',
          updatedAt: 500,
          startedAt: 100,
          status: 'busy',
          name: 'Self',
          messagingSocketPath: '\\\\.\\pipe\\self-live',
          bridgeSessionId: 'session_bridge_self',
        },
        {
          pid: 3002,
          sessionId: 'session-same-cwd',
          cwd: 'D:\\workspace\\repo',
          updatedAt: 400,
          startedAt: 100,
          status: 'waiting',
          waitingFor: 'tool_result',
          name: 'Waiter',
          messagingSocketPath: '\\\\.\\pipe\\wait-live',
        },
        {
          pid: 3003,
          sessionId: 'session-bridge-only',
          cwd: 'D:\\workspace\\other',
          updatedAt: 450,
          startedAt: 120,
          status: 'busy',
          name: 'BridgeOnly',
          messagingSocketPath: '\\\\.\\pipe\\dead-socket',
          bridgeSessionId: 'session_bridge_only',
        },
      ],
      {
        currentPid: 3001,
        currentSessionId: 'session-self',
        currentBridgeSessionId: 'session_bridge_self',
        currentCwd: 'D:\\workspace\\repo',
        probeSocket: async socketPath =>
          socketPath !== '\\\\.\\pipe\\dead-socket',
      },
    )

    expect(peers.map(peer => peer.sessionId)).toEqual([
      'session-self',
      'session-same-cwd',
      'session-bridge-only',
    ])
    expect(peers[0]?.isSelf).toBe(true)
    expect(peers[2]).toMatchObject({
      preferredAddress: 'bridge:session_bridge_only',
      alternateAddresses: [],
      transports: ['bridge'],
      isSelf: false,
    })
  })

  test('marks a bridge peer as self when its bridge session id matches the current bridge identity', async () => {
    const peers = await buildPeerSessions(
      [
        {
          pid: 4001,
          sessionId: 'session-remote-copy',
          cwd: 'D:\\workspace\\remote',
          updatedAt: 600,
          startedAt: 100,
          status: 'busy',
          name: 'RemoteSelf',
          bridgeSessionId: 'session_bridge_self',
        },
      ],
      {
        currentPid: 9999,
        currentSessionId: 'session-local',
        currentBridgeSessionId: 'session_bridge_self',
        currentCwd: 'D:\\workspace\\local',
        probeSocket: async () => false,
      },
    )

    expect(peers).toHaveLength(1)
    expect(peers[0]).toMatchObject({
      preferredAddress: 'bridge:session_bridge_self',
      transports: ['bridge'],
      isSelf: true,
    })
  })

  test('routes bridge aliases to local uds peers when a live local socket exists', async () => {
    const sent: Array<{ socketPath: string; text: string }> = []

    const result = await postInterClaudeMessage('session_bridge_alpha', 'hello', {
      listPeers: async () => [
        {
          id: 'session-alpha',
          sessionId: 'session-alpha',
          preferredAddress: 'uds:\\\\.\\pipe\\alpha-live',
          alternateAddresses: ['bridge:session_bridge_alpha'],
          transports: ['bridge', 'uds'],
          source: 'local_registry',
          status: 'idle',
          isSelf: false,
          canReceiveStructuredMessages: false,
        },
      ],
      sendToUds: async (socketPath, text) => {
        sent.push({ socketPath, text })
      },
    })

    expect(result).toEqual({ ok: true })
    expect(sent).toEqual([
      {
        socketPath: '\\\\.\\pipe\\alpha-live',
        text: 'hello',
      },
    ])
  })

  test('delivers bridge-only peers through the remote session events API', async () => {
    const remoteCalls: Array<{
      sessionId: string
      content: string
    }> = []

    const result = await postInterClaudeMessage(
      'session_bridge_remote',
      'hello <remote>',
      {
        listPeers: async () => [],
        sendRemoteEvent: async (sessionId, content) => {
          remoteCalls.push({ sessionId, content })
          return true
        },
        getSelfBridgeSessionId: () => 'session_bridge_self',
        getCurrentSessionId: () => 'local-session-uuid',
        getCurrentCwd: () => 'D:\\workspace\\repo',
        getSessionName: () => 'Sender',
      },
    )

    expect(result).toEqual({ ok: true })
    expect(remoteCalls).toHaveLength(1)
    expect(remoteCalls[0]?.sessionId).toBe('session_bridge_remote')
    expect(remoteCalls[0]?.content).toContain('<cross-session-message')
    expect(remoteCalls[0]?.content).toContain(
      'from="bridge:session_bridge_self"',
    )
    expect(remoteCalls[0]?.content).toContain(
      'session_id="local-session-uuid"',
    )
    expect(remoteCalls[0]?.content).toContain('transport="bridge"')
    expect(remoteCalls[0]?.content).toContain('name="Sender"')
    expect(remoteCalls[0]?.content).toContain('cwd="D:\\workspace\\repo"')
    expect(remoteCalls[0]?.content).toContain('hello &lt;remote&gt;')
  })

  test('rejects bridge delivery when the current session has no replyable bridge identity', async () => {
    const result = await postInterClaudeMessage('session_bridge_remote', 'hello', {
      listPeers: async () => [],
      getSelfBridgeSessionId: () => undefined,
      getCurrentSessionId: () => 'local-session-uuid',
      getCurrentCwd: () => 'D:\\workspace\\repo',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('not connected to Remote Control')
  })

  test('rejects bridge delivery to the current bridge session before remote fallback', async () => {
    const sendRemoteEvent = mock(async () => true)

    const result = await postInterClaudeMessage('session_bridge_self', 'hello', {
      listPeers: async () => [],
      sendRemoteEvent,
      getSelfBridgeSessionId: () => 'session_bridge_self',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('current session')
    expect(sendRemoteEvent).not.toHaveBeenCalled()
  })
})
