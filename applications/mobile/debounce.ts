export function debounce<A extends unknown[]>(
  func: (...args: A) => void,
  wait?: number,
  leading?: boolean,
): ((...args: A) => void) & {
  cancel: () => void
} {
  // `@types/node` ends up in this program (via `@storyteller-platform/audiobook`)
  // and its `setTimeout` overload can win over the DOM one, so the timer's type
  // is not reliably `number`.
  let timeout: ReturnType<typeof setTimeout> | null
  let isCancelled = false

  function debounced(this: unknown, ...args: A): void {
    isCancelled = false
    if (leading && !timeout) {
      func.apply(this, args)
    }
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => {
      timeout = null
      if (!(leading || isCancelled)) {
        func.apply(this, args)
      }
      isCancelled = false
    }, wait)
  }

  debounced.cancel = () => {
    isCancelled = true
  }

  return debounced
}
