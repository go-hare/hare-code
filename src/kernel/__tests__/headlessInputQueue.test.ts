import { describe, expect, test } from 'bun:test'

import { createKernelHeadlessInputQueue } from '../headlessInputQueue.js'

describe('createKernelHeadlessInputQueue', () => {
  test('yields queued prompts in order and closes cleanly', async () => {
    const queue = createKernelHeadlessInputQueue()
    const iterator = queue[Symbol.asyncIterator]()

    queue.pushUserTurn({ prompt: 'first' })
    queue.pushUserTurn({ prompt: 'second' })

    expect(await iterator.next()).toEqual({
      done: false,
      value: 'first',
    })
    expect(await iterator.next()).toEqual({
      done: false,
      value: 'second',
    })

    queue.close()

    expect(await iterator.next()).toEqual({
      done: true,
      value: undefined,
    })
  })

  test('rejects new turns after close', () => {
    const queue = createKernelHeadlessInputQueue()

    queue.close()

    expect(() => queue.pushUserTurn({ prompt: 'later' })).toThrow(
      'Kernel headless input queue is already closed',
    )
  })
})
