import { type FrameManager } from "@readium/navigator"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"

import { getClientXY } from "./mouseHelpers"

const NavigatorEventsContext = createContext<{
  registeredHandlers: {
    clickOrTap: ((event: MouseEvent | TouchEvent) => void)[]
    mouseMove: ((event: MouseEvent) => void)[]
  }
  registerClickHandler: (
    handler: (event: MouseEvent | TouchEvent) => void,
  ) => void
  unregisterClickHandler: (
    handler: (event: MouseEvent | TouchEvent) => void,
  ) => void
  registerMouseMoveHandler: (handler: (event: MouseEvent) => void) => void
  unregisterMouseMoveHandler: (handler: (event: MouseEvent) => void) => void
}>({
  registeredHandlers: { clickOrTap: [], mouseMove: [] },
  registerClickHandler: () => {},
  unregisterClickHandler: () => {},
  registerMouseMoveHandler: () => {},
  unregisterMouseMoveHandler: () => {},
})

export const useNavigatorEvents = () => {
  return useContext(NavigatorEventsContext)
}

export const NavigatorEventsProvider = ({
  children,
  listeners,
  activeFrame,
}: {
  children: React.ReactNode
  activeFrame: FrameManager | null
  listeners?: {
    clickOrTap?: ((event: MouseEvent | TouchEvent) => void)[]
    mouseMove?: ((event: MouseEvent) => void)[]
  }
}) => {
  const [registeredHandlers, setRegisteredHandlers] = useState<{
    clickOrTap: ((event: MouseEvent | TouchEvent) => void)[]
    mouseMove: ((event: MouseEvent) => void)[]
  }>({
    clickOrTap: [],
    mouseMove: [],
  })

  const registerClickHandler = useCallback(
    (handler: (event: MouseEvent | TouchEvent) => void) => {
      setRegisteredHandlers((prev) => ({
        ...prev,
        clickOrTap: [...prev.clickOrTap, handler],
      }))
    },
    [],
  )
  const registerMouseMoveHandler = useCallback(
    (handler: (event: MouseEvent) => void) => {
      setRegisteredHandlers((prev) => ({
        ...prev,
        mouseMove: [...prev.mouseMove, handler],
      }))
    },
    [],
  )

  const unregisterClickHandler = useCallback(
    (handler: (event: MouseEvent | TouchEvent) => void) => {
      setRegisteredHandlers((prev) => ({
        ...prev,
        clickOrTap: prev.clickOrTap.filter((h) => h !== handler),
      }))
    },
    [],
  )

  const unregisterMouseMoveHandler = useCallback(
    (handler: (event: MouseEvent) => void) => {
      setRegisteredHandlers((prev) => ({
        ...prev,
        mouseMove: prev.mouseMove.filter((h) => h !== handler),
      }))
    },
    [],
  )

  const pendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startXRef = useRef<number | null>(null)
  const startYRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)

  useEffect(() => {
    if (!activeFrame) return

    const tapThreshold = 10 // max pixels of movement allowed to still count as a tap
    const tapTimeThresholdMs = 300
    const uiToggleDelayMs = 350 // same as double click timeout

    function handleStart(event: MouseEvent | TouchEvent) {
      const [startX, startY] = getClientXY(event)
      if (startX === undefined || startY === undefined) return

      startXRef.current = startX
      startYRef.current = startY
      startTimeRef.current = Date.now()
    }

    function handleEnd(event: MouseEvent | TouchEvent) {
      if (
        startXRef.current === null ||
        startYRef.current === null ||
        startTimeRef.current === null
      ) {
        return
      }

      const [endX, endY] = getClientXY(event)

      if (endX === undefined || endY === undefined) return

      const deltaX = Math.abs(endX - startXRef.current)
      const deltaY = Math.abs(endY - startYRef.current)
      const deltaTime = Date.now() - startTimeRef.current

      // only trigger handlers if movement is minimal, eg not scrolling, dragging, double tap, highlighting text, etc
      if (
        deltaX < tapThreshold &&
        deltaY < tapThreshold &&
        deltaTime < tapTimeThresholdMs &&
        deltaTime > 5 // don't trigger on fast clicks (this is mostly to make it work in dev mode, strict mode runs effects twice too quickly)
      ) {
        if (pendingTimeoutRef.current !== null) {
          clearTimeout(pendingTimeoutRef.current)
          pendingTimeoutRef.current = null
        } else {
          pendingTimeoutRef.current = setTimeout(() => {
            listeners?.clickOrTap?.forEach((handler) => {
              handler(event)
            })
            registeredHandlers.clickOrTap.forEach((handler) => {
              handler(event)
            })
            pendingTimeoutRef.current = null
          }, uiToggleDelayMs)
        }
      }

      startXRef.current = null
      startYRef.current = null
      startTimeRef.current = null
    }

    try {
      listeners?.mouseMove?.forEach((handler) => {
        activeFrame.iframe.contentWindow?.addEventListener("mousemove", handler)
      })
      registeredHandlers.mouseMove.forEach((handler) => {
        activeFrame.iframe.contentWindow?.addEventListener("mousemove", handler)
      })
      activeFrame.iframe.contentWindow?.addEventListener(
        "mousedown",
        handleStart,
      )
      activeFrame.iframe.contentWindow?.addEventListener("mouseup", handleEnd)
      activeFrame.iframe.contentWindow?.addEventListener(
        "touchstart",
        handleStart,
      )
      activeFrame.iframe.contentWindow?.addEventListener("touchend", handleEnd)
    } catch (error) {
      // this is probably fineee
      console.warn("Error adding click handler:", error)
    }
    return () => {
      // cleanup any pending timeout
      if (pendingTimeoutRef.current !== null) {
        clearTimeout(pendingTimeoutRef.current)
        pendingTimeoutRef.current = null
      }

      try {
        listeners?.mouseMove?.forEach((handler) => {
          activeFrame.iframe.contentWindow?.removeEventListener(
            "mousemove",
            handler,
          )
        })
        registeredHandlers.mouseMove.forEach((handler) => {
          activeFrame.iframe.contentWindow?.removeEventListener(
            "mousemove",
            handler,
          )
        })
        activeFrame.iframe.contentWindow?.removeEventListener(
          "mousedown",
          handleStart,
        )
        activeFrame.iframe.contentWindow?.removeEventListener(
          "mouseup",
          handleEnd,
        )
        activeFrame.iframe.contentWindow?.removeEventListener(
          "touchstart",
          handleStart,
        )
        activeFrame.iframe.contentWindow?.removeEventListener(
          "touchend",
          handleEnd,
        )
      } catch (error) {
        // this is probably fineee
        console.warn("Error removing click handler:", error)
      }
    }
  }, [activeFrame, registeredHandlers, listeners])

  return (
    <NavigatorEventsContext.Provider
      value={{
        registeredHandlers,
        registerClickHandler,
        unregisterClickHandler,
        registerMouseMoveHandler,
        unregisterMouseMoveHandler,
      }}
    >
      {children}
    </NavigatorEventsContext.Provider>
  )
}

export const useRegisterNavigatorClickhandler = (
  handler: (event: MouseEvent | TouchEvent) => void,
) => {
  const { registerClickHandler, unregisterClickHandler } = useNavigatorEvents()
  useEffect(() => {
    registerClickHandler(handler)
    return () => {
      unregisterClickHandler(handler)
    }
  }, [registerClickHandler, unregisterClickHandler, handler])
}
