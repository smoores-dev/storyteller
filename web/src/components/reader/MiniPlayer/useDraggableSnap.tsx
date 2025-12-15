import { useCallback, useEffect, useState } from "react"

import { getClientXY } from "../hooks/mouseHelpers"

import {
  type EdgePosition,
  type Position,
  absoluteToEdgePosition,
  snapToEdge,
} from "./positionFns"

export type UseDraggableSnapProps = {
  enabled: boolean
  elementRef: React.RefObject<HTMLElement | HTMLDivElement | null>
  onPositionChange: (pos: Position) => void
  onDragEnd: (edgePos: EdgePosition) => void
}

export const useDraggableSnap = ({
  enabled,
  elementRef,
  onPositionChange,
  onDragEnd,
}: UseDraggableSnapProps) => {
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  const [isStartingDrag, setIsStartingDrag] = useState(false)

  const handleDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const element = elementRef.current
      if (!enabled || !element) return

      const rect = element.getBoundingClientRect()
      const [clientX, clientY] = getClientXY(e.nativeEvent)

      if (clientX === undefined || clientY === undefined) return
      const offsetX = clientX - rect.left
      const offsetY = clientY - rect.top

      setDragOffset({
        x: offsetX,
        y: offsetY,
      })

      setIsStartingDrag(true)
    },
    [enabled, elementRef],
  )

  const handleMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!isStartingDrag) return

      const element = elementRef.current

      if (!element) return

      const [clientX, clientY] = getClientXY(e)
      if (clientX === undefined || clientY === undefined) return

      const x = clientX - dragOffset.x
      const y = clientY - dragOffset.y

      if (!isDragging && y < 40 && x < 40) {
        return
      }

      if (!isDragging) {
        setIsDragging(true)
      }

      onPositionChange({ x, y })
    },
    [
      elementRef,
      dragOffset.x,
      dragOffset.y,
      isDragging,
      isStartingDrag,
      onPositionChange,
    ],
  )

  const handleMouseUp = useCallback(() => {
    const element = elementRef.current
    setIsStartingDrag(false)
    if (!isDragging || !element) return
    setIsDragging(false)
    setIsStartingDrag(false)

    const rect = element.getBoundingClientRect()
    const snapped = snapToEdge(rect.left, rect.top, rect.width, rect.height)

    const edgePos = absoluteToEdgePosition(
      snapped.x,
      snapped.y,
      rect.width,
      rect.height,
    )

    onDragEnd(edgePos)
  }, [isDragging, elementRef, snapToEdge, onDragEnd])

  useEffect(() => {
    const abortController = new AbortController()
    const { signal } = abortController

    window.addEventListener(
      "mousemove",
      (e: MouseEvent) => {
        handleMove(e)
      },
      { signal },
    )
    window.addEventListener(
      "mouseup",
      () => {
        handleMouseUp()
      },
      { signal },
    )
    window.addEventListener(
      "touchmove",
      (e: TouchEvent) => {
        handleMove(e)
      },
      { signal },
    )
    window.addEventListener(
      "touchend",
      () => {
        handleMouseUp()
      },
      { signal },
    )

    return () => {
      abortController.abort()
    }
  }, [handleMove, handleMouseUp])

  return {
    isDragging,
    handleMouseDown: handleDown,
  }
}
