import { strict as assert } from 'node:assert'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

async function main(): Promise<void> {
  const sdkEntry = pathToFileURL(resolve(process.cwd(), 'dist', 'sdk.js')).href
  const sdk = await import(sdkEntry)
  const {
    createHeadlessChatSession,
    createInMemoryRuntime,
    createRuntimeHostSession,
  } = sdk

  assert.equal(typeof createHeadlessChatSession, 'function')
  assert.equal(typeof createInMemoryRuntime, 'function')
  assert.equal(typeof createRuntimeHostSession, 'function')

  const headlessSession = createHeadlessChatSession({
    cwd: process.cwd(),
    provider: {
      model: 'claude-sonnet-4-6',
    },
  })
  assert.ok(headlessSession.getSessionId().length > 0)
  headlessSession.abort()
  await headlessSession.close()

  const { client, handle, session } = await createInMemoryRuntime({
    session: {
      initialConversationId: 'sdk-smoke',
    },
  })

  await client.publishHostEvent({
    eventType: 'system',
    text: 'host ready',
  })

  const turnId = await client.submitInput({
    text: 'hello runtime bridge',
  })
  assert.ok(turnId.length > 0, 'submitInput should return a turnId')

  const taskId = await client.submitGoal({
    goal: 'Verify runtime task flow',
    source: 'sdk-smoke',
  })
  assert.ok(taskId.length > 0, 'submitGoal should return a taskId')

  const controlResult = await client.controlTask(taskId, 'stop')
  assert.equal(controlResult.accepted, true, 'controlTask(stop) should succeed')

  const state = handle.getState()
  const task = state.tasks.find(item => item.taskId === taskId)

  assert.ok(task, 'goal task should exist in runtime state')
  assert.equal(task?.status, 'killed', 'goal task should be stopped')

  const events = await client.drainEvents()
  assert.ok(events.length > 0, 'runtime should emit bridge events')
  assert.ok(
    events.some(event => event.type === 'task_started' && event.taskId === taskId),
    'goal submission should emit task_started',
  )
  assert.ok(
    events.some(event => event.type === 'task_failed' && event.taskId === taskId),
    'stopping the task should emit task_failed',
  )

  const sessionInfo = await client.getSession()
  assert.equal(sessionInfo?.sessionId, session.sessionId)

  await client.stop()

  console.log(
    JSON.stringify(
      {
        sessionId: session.sessionId,
        turnId,
        taskId,
        eventCount: events.length,
      },
      null,
      2,
    ),
  )
}

void main()
