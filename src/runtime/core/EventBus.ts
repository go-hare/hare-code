import type { RuntimeEvent } from '../types/index.js'

export type RuntimeEventListener<TEvent> = (event: TEvent) => void

export class EventBus<TEvent> {
  #queue: TEvent[] = []
  #listeners = new Set<RuntimeEventListener<TEvent>>()
  #waiters: Array<(event: TEvent | null) => void> = []

  emit(event: TEvent): void {
    const waiter = this.#waiters.shift()
    if (waiter) {
      waiter(event)
    } else {
      this.#queue.push(event)
    }
    for (const listener of this.#listeners) {
      listener(event)
    }
  }

  subscribe(listener: RuntimeEventListener<TEvent>): () => void {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  poll(): TEvent | null {
    return this.#queue.shift() ?? null
  }

  async wait(timeoutMs?: number): Promise<TEvent | null> {
    const next = this.poll()
    if (next) {
      return next
    }

    return new Promise(resolve => {
      const waiter = this.#createWaiter(resolve, timeoutMs)
      this.#waiters.push(waiter)
    })
  }

  drain(): TEvent[] {
    const drained = [...this.#queue]
    this.#queue.length = 0
    return drained
  }

  size(): number {
    return this.#queue.length
  }

  clear(): void {
    this.#queue.length = 0
    const waiters = [...this.#waiters]
    this.#waiters.length = 0
    for (const waiter of waiters) {
      waiter(null)
    }
  }

  #createWaiter(
    resolve: (event: TEvent | null) => void,
    timeoutMs?: number,
  ): (event: TEvent | null) => void {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const waiter = (event: TEvent | null) => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      resolve(event)
    }

    if (timeoutMs && timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        this.#waiters = this.#waiters.filter(candidate => candidate !== waiter)
        resolve(null)
      }, timeoutMs)
    }

    return waiter
  }
}

export class RuntimeEventBus extends EventBus<RuntimeEvent> {}
