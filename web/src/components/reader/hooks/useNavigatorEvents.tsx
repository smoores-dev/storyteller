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

/**
 * return true to stop event propagation
 */
type NavigatorClickHandler = (
  event: MouseEvent | TouchEvent,
) => boolean | undefined

/**
 * return true to stop event propagation
 */
type NavigatorMouseMoveHandler = (event: MouseEvent) => boolean | undefined

const NavigatorEventsContext = createContext<{
  registeredHandlers: {
    clickOrTap: { handler: NavigatorClickHandler; priority?: number }[]
    mouseMove: { handler: NavigatorMouseMoveHandler; priority?: number }[]
  }
  registerClickHandler: (
    handler: NavigatorClickHandler,
    priority?: number,
  ) => void
  unregisterClickHandler: (handler: NavigatorClickHandler) => void
  registerMouseMoveHandler: (
    handler: NavigatorMouseMoveHandler,
    priority?: number,
  ) => void
  unregisterMouseMoveHandler: (handler: NavigatorMouseMoveHandler) => void
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
    clickOrTap?: { handler: NavigatorClickHandler; priority?: number }[]
    mouseMove?: { handler: NavigatorMouseMoveHandler; priority?: number }[]
  }
}) => {
  const [registeredHandlers, setRegisteredHandlers] = useState<{
    clickOrTap: { handler: NavigatorClickHandler; priority: number }[]
    mouseMove: { handler: NavigatorMouseMoveHandler; priority: number }[]
  }>({
    clickOrTap: [],
    mouseMove: [],
  })

  const registerClickHandler = useCallback(
    (
      handler: (event: MouseEvent | TouchEvent) => boolean | undefined,
      priority: number = 100,
    ) => {
      setRegisteredHandlers((prev) => ({
        ...prev,
        clickOrTap: [...prev.clickOrTap, { handler, priority }].sort(
          (a, b) => a.priority - b.priority,
        ),
      }))
    },
    [],
  )
  const registerMouseMoveHandler = useCallback(
    (handler: NavigatorMouseMoveHandler, priority: number = 100) => {
      setRegisteredHandlers((prev) => ({
        ...prev,
        mouseMove: [...prev.mouseMove, { handler, priority }].sort(
          (a, b) => a.priority - b.priority,
        ),
      }))
    },
    [],
  )

  const unregisterClickHandler = useCallback(
    (handler: NavigatorClickHandler) => {
      setRegisteredHandlers((prev) => ({
        ...prev,
        clickOrTap: prev.clickOrTap.filter((h) => h.handler !== handler),
      }))
    },
    [],
  )

  const unregisterMouseMoveHandler = useCallback(
    (handler: NavigatorMouseMoveHandler) => {
      setRegisteredHandlers((prev) => ({
        ...prev,
        mouseMove: prev.mouseMove.filter((h) => h.handler !== handler),
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
    const uiToggleDelayMs = 250 // same as double click timeout

    const abortController = new AbortController()
    const { signal } = abortController

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
            const allHandlersByPriority = [
              ...(listeners?.clickOrTap ?? []),
              ...registeredHandlers.clickOrTap,
            ].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))

            for (const handler of allHandlersByPriority) {
              const shouldStopPropagation = handler.handler(event)
              if (shouldStopPropagation) {
                pendingTimeoutRef.current = null
                return
              }
            }
            pendingTimeoutRef.current = null
          }, uiToggleDelayMs)
          return
        }
      }

      startXRef.current = null
      startYRef.current = null
      startTimeRef.current = null
    }

    const wnd = activeFrame.iframe.contentWindow
    try {
      listeners?.mouseMove?.forEach(({ handler }) => {
        wnd?.addEventListener("mousemove", handler, { signal })
      })
      registeredHandlers.mouseMove.forEach(({ handler }) => {
        wnd?.addEventListener("mousemove", handler, { signal })
      })

      wnd?.addEventListener("mousedown", handleStart, { signal })
      wnd?.addEventListener("mouseup", handleEnd, { signal })
      wnd?.addEventListener("touchstart", handleStart, { signal })
      wnd?.addEventListener("touchend", handleEnd, { signal })
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
        abortController.abort()
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
  handler: NavigatorClickHandler,
  priority?: number,
) => {
  const { registerClickHandler, unregisterClickHandler } = useNavigatorEvents()
  useEffect(() => {
    registerClickHandler(handler, priority)
    return () => {
      unregisterClickHandler(handler)
    }
  }, [registerClickHandler, unregisterClickHandler, handler, priority])
}
