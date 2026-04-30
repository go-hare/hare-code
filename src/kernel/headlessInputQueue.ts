type QueueTurnResolver = (value: IteratorResult<string>) => void

export type KernelHeadlessQueuedUserTurn = {
  prompt: string
  turnId?: string
  attachments?: readonly unknown[]
  metadata?: Record<string, unknown>
}

export type KernelHeadlessQueuedInterrupt = {
  turnId?: string
  reason?: string
}

type KernelHeadlessInputQueueItem =
  | {
      kind: 'turn'
      turn: KernelHeadlessQueuedUserTurn
    }
  | {
      kind: 'interrupt'
      request: KernelHeadlessQueuedInterrupt
    }

type KernelHeadlessInputQueueSubscriber = (
  item: KernelHeadlessInputQueueItem,
) => void

type KernelHeadlessInputQueueControl = {
  subscribe(subscriber: KernelHeadlessInputQueueSubscriber): () => void
}

const KERNEL_HEADLESS_INPUT_QUEUE_CONTROL = Symbol(
  'kernel.headless.inputQueue.control',
)

type KernelHeadlessInputQueueWithControl = KernelHeadlessInputQueue & {
  [KERNEL_HEADLESS_INPUT_QUEUE_CONTROL]: KernelHeadlessInputQueueControl
}

export type KernelHeadlessInputQueue = AsyncIterable<string> & {
  pushUserTurn(turn: KernelHeadlessQueuedUserTurn): void
  pushInterrupt(request: KernelHeadlessQueuedInterrupt): void
  close(reason?: string): void
}

export function createKernelHeadlessInputQueue(): KernelHeadlessInputQueue {
  const prompts: string[] = []
  const resolvers: QueueTurnResolver[] = []
  const subscribers = new Set<KernelHeadlessInputQueueSubscriber>()
  let closed = false

  const flush = (): void => {
    while (prompts.length > 0 && resolvers.length > 0) {
      const resolve = resolvers.shift()
      const prompt = prompts.shift()
      if (resolve && prompt !== undefined) {
        resolve({ done: false, value: prompt })
      }
    }

    if (!closed || prompts.length > 0) {
      return
    }

    while (resolvers.length > 0) {
      const resolve = resolvers.shift()
      resolve?.({ done: true, value: undefined })
    }
  }

  const notify = (item: KernelHeadlessInputQueueItem): void => {
    for (const subscriber of subscribers) {
      subscriber(item)
    }
  }

  const queue = {
    pushUserTurn(turn) {
      if (closed) {
        throw new Error('Kernel headless input queue is already closed')
      }
      prompts.push(turn.prompt)
      notify({ kind: 'turn', turn })
      flush()
    },

    pushInterrupt(request) {
      if (closed) {
        return
      }
      notify({ kind: 'interrupt', request })
    },

    close(_reason) {
      if (closed) {
        return
      }
      closed = true
      flush()
    },

    async *[Symbol.asyncIterator]() {
      while (true) {
        if (prompts.length > 0) {
          const prompt = prompts.shift()
          if (prompt !== undefined) {
            yield prompt
            continue
          }
        }

        if (closed) {
          return
        }

        const next = await new Promise<IteratorResult<string>>(resolve => {
          resolvers.push(resolve)
        })
        if (next.done) {
          return
        }
        yield next.value
      }
    },

    [KERNEL_HEADLESS_INPUT_QUEUE_CONTROL]: {
      subscribe(subscriber) {
        subscribers.add(subscriber)
        return () => {
          subscribers.delete(subscriber)
        }
      },
    },
  } satisfies KernelHeadlessInputQueueWithControl

  return queue
}

export function isKernelHeadlessInputQueue(
  value: unknown,
): value is KernelHeadlessInputQueueWithControl {
  return (
    typeof value === 'object' &&
    value !== null &&
    KERNEL_HEADLESS_INPUT_QUEUE_CONTROL in value
  )
}

export function subscribeKernelHeadlessInputQueue(
  queue: KernelHeadlessInputQueue,
  subscriber: KernelHeadlessInputQueueSubscriber,
): () => void {
  if (!isKernelHeadlessInputQueue(queue)) {
    return () => {}
  }
  return queue[KERNEL_HEADLESS_INPUT_QUEUE_CONTROL].subscribe(subscriber)
}
