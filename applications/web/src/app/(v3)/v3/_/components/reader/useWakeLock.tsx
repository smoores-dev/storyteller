import { useCallback, useEffect, useRef } from "react"

export function useWakeLock(onError?: (error: Error) => void) {
  const sentinelRef = useRef<WakeLockSentinel | null>(null)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  const acquireWakeLock = useCallback(async () => {
    if (
      !("wakeLock" in navigator) ||
      sentinelRef.current ||
      document.visibilityState !== "visible"
    ) {
      return
    }
    try {
      const sentinel = await navigator.wakeLock.request("screen")
      sentinelRef.current = sentinel
      sentinel.addEventListener("release", () => {
        if (sentinelRef.current === sentinel) sentinelRef.current = null
      })
    } catch (error) {
      onErrorRef.current?.(
        error instanceof Error
          ? error
          : new Error("Failed to acquire wake lock"),
      )
    }
  }, [])

  useEffect(() => {
    void acquireWakeLock()
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void acquireWakeLock()
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
      void sentinelRef.current?.release()
      sentinelRef.current = null
    }
  }, [acquireWakeLock])

  return { acquireWakeLock }
}
