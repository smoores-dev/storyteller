import { type RefObject, useCallback, useEffect, useRef, useState } from "react"

interface UseWakeLockOptions {
  onAcquire?: () => void
  onRelease?: () => void
  onError?: (error: Error) => void
}

interface UseWakeLockReturn {
  isSupported: boolean
  isActive: boolean
  release: () => Promise<void>
  acquireWakeLock: () => Promise<void>
}

export function useWakeLock(
  triggerRef: RefObject<HTMLElement | null>,
  options: UseWakeLockOptions = {},
): UseWakeLockReturn {
  const [isActive, setIsActive] = useState(false)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const { onAcquire, onRelease, onError } = options

  const isSupported =
    typeof navigator !== "undefined" && "wakeLock" in navigator

  const acquireWakeLock = useCallback(async (): Promise<void> => {
    if (!isSupported || wakeLockRef.current) {
      return
    }

    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen")
      setIsActive(true)
      onAcquire?.()

      // listen for wake lock release (e.g., when tab becomes inactive)
      // i don't think this happens automatically, we release the lock manually
      wakeLockRef.current.addEventListener("release", () => {
        setIsActive(false)
        wakeLockRef.current = null
        onRelease?.()
      })
    } catch (error) {
      const wakeLockError =
        error instanceof Error
          ? error
          : new Error("Failed to acquire wake lock")
      onError?.(wakeLockError)
    }
  }, [isSupported, onAcquire, onRelease, onError])

  const release = useCallback(async (): Promise<void> => {
    if (!wakeLockRef.current) {
      return
    }

    try {
      await wakeLockRef.current.release()
      wakeLockRef.current = null
      setIsActive(false)
      onRelease?.()
    } catch (error) {
      const releaseError =
        error instanceof Error
          ? error
          : new Error("Failed to release wake lock")
      onError?.(releaseError)
    }
  }, [onRelease, onError])

  // attach click handler to trigger element
  useEffect(() => {
    const element = triggerRef.current
    if (!isSupported || !element) {
      return
    }

    const handleClick = () => {
      if (!wakeLockRef.current) {
        void acquireWakeLock()
      }
    }

    element.addEventListener("click", handleClick)

    return () => {
      element.removeEventListener("click", handleClick)
    }
  }, [triggerRef, isSupported, acquireWakeLock])

  // acquire and release wake lock when page becomes visible and hidden
  useEffect(() => {
    if (!isSupported) {
      return
    }

    const handleVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        isActive &&
        !wakeLockRef.current
      ) {
        void acquireWakeLock()
      } else if (
        document.visibilityState === "hidden" &&
        isActive &&
        wakeLockRef.current
      ) {
        void release()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [isActive, isSupported, acquireWakeLock, release])

  // cleanup
  useEffect(() => {
    return () => {
      if (wakeLockRef.current) {
        void wakeLockRef.current.release()
      }
    }
  }, [])

  return {
    isSupported,
    isActive,
    release,
    acquireWakeLock,
  }
}
