export function debounce<A extends unknown[]>(
  func: (...args: A) => void,
  wait?: number,
  leading?: boolean,
): ((...args: A) => void) & {
  cancel: () => void
} {
  let timeout: NodeJS.Timeout | null
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
