import { useCallback, useInsertionEffect, useRef } from "react"

export function useEffectEvent<P extends unknown[], R>(
  fn: (...args: P) => R,
): (...funcArgs: P) => R {
  const ref = useRef(fn)

  useInsertionEffect(() => {
    ref.current = fn
  }, [fn])

  return useCallback((...args: P): R => {
    const f = ref.current
    return f(...args)
  }, [])
}
