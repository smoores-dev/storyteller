import { useCallback, useEffect, useRef } from "react"

export function useThrottledCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  wait: number,
) {
  const callbackRef = useRef(callback)
  const lastCallRef = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingArgsRef = useRef<Args | null>(null)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    },
    [],
  )

  return useCallback(
    (...args: Args) => {
      const remaining = wait - (Date.now() - lastCallRef.current)
      if (remaining <= 0) {
        lastCallRef.current = Date.now()
        callbackRef.current(...args)
        return
      }
      pendingArgsRef.current = args
      if (timeoutRef.current) return
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null
        lastCallRef.current = Date.now()
        if (pendingArgsRef.current)
          callbackRef.current(...pendingArgsRef.current)
        pendingArgsRef.current = null
      }, remaining)
    },
    [wait],
  )
}
