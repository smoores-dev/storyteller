export function throttle<R, A extends unknown[]>(
  fn: (...args: A) => R,
  delay: number,
) {
  let wait = false
  let timeout: undefined | number
  let cancelled = false
  let lastArgs: A | undefined

  function throttled(...args: A) {
    if (cancelled) return undefined

    if (wait) {
      // store the arguments of the last function call within waiting period
      lastArgs = args
      return
    }

    wait = true

    const val = fn(...args)

    const startWaitingPeriod = () =>
      window.setTimeout(() => {
        // if at the end of the waiting period lastArgs exist, execute the function using it
        if (lastArgs) {
          fn(...lastArgs)
          lastArgs = undefined
          timeout = startWaitingPeriod()
        } else {
          wait = false
        }
      }, delay)

    timeout = startWaitingPeriod()

    return val
  }

  throttled.cancel = () => {
    cancelled = true
    lastArgs = undefined
    clearTimeout(timeout)
  }

  return throttled
}
