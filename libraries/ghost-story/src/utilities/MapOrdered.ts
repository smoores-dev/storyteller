// FIFO queue with concurrency for mapping over an iterable

export async function* mapOrdered<T, R>(
  items: Iterable<T>,
  concurrency: number,
  fn: (item: T, signal: AbortSignal) => Promise<R>,
  signal: AbortSignal | null,
): AsyncGenerator<R, void, void> {
  const controller = new AbortController()
  const scope = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal

  const iterator = items[Symbol.iterator]()
  const inflight: Promise<R>[] = []

  const fill = () => {
    while (inflight.length < concurrency) {
      const next = iterator.next()
      if (next.done) {
        return
      }
      const task = (async () => fn(next.value, scope))()
      task.catch(() => {})
      inflight.push(task)
    }
  }

  try {
    fill()
    for (;;) {
      const first = inflight.shift()
      if (!first) {
        return
      }
      const result = await first
      fill()
      yield result
    }
  } finally {
    controller.abort(new Error("mapOrdered scope closed"))
    await Promise.allSettled(inflight)
  }
}
