import { NAV_BAR_WIDTH } from "@/components/reader/constants"

export type EdgePosition = {
  horizontalEdge: "left" | "right"
  verticalEdge: "top" | "bottom"
  horizontalOffset: number
  verticalOffset: number
}

export type Position = { x: number; y: number }

export const SNAP_OFFSET = 20
export const CORNER_THRESHOLD = 200

export const snapToEdge = (
  x: number,
  y: number,
  elementWidth: number,
  elementHeight: number,
) => {
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight

  const distToLeft = x
  const distToRight = windowWidth - (x + elementWidth)
  const distToTop = y
  const distToBottom = windowHeight - (y + elementHeight)

  let snappedX = x
  let snappedY = y

  // snap horizontally if close to an edge
  if (distToLeft < CORNER_THRESHOLD) {
    snappedX = SNAP_OFFSET + NAV_BAR_WIDTH
  } else if (distToRight < CORNER_THRESHOLD) {
    snappedX = windowWidth - elementWidth - SNAP_OFFSET
  }

  // snap vertically if close to an edge
  if (distToTop < CORNER_THRESHOLD) {
    snappedY = SNAP_OFFSET
  } else if (distToBottom < CORNER_THRESHOLD) {
    snappedY = windowHeight - elementHeight - SNAP_OFFSET
  }

  return { x: snappedX, y: snappedY }
}

export const edgePositionToAbsolute = (
  edgePos: EdgePosition,
  elementWidth: number,
  elementHeight: number,
): Position => {
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight

  let x: number
  let y: number

  if (edgePos.horizontalEdge === "left") {
    x = edgePos.horizontalOffset
  } else {
    x = windowWidth - elementWidth - edgePos.horizontalOffset
  }

  if (edgePos.verticalEdge === "top") {
    y = edgePos.verticalOffset
  } else {
    y = windowHeight - elementHeight - edgePos.verticalOffset
  }

  return { x, y }
}

export const absoluteToEdgePosition = (
  x: number,
  y: number,
  elementWidth: number,
  elementHeight: number,
): EdgePosition => {
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight

  const distToLeft = x
  const distToRight = windowWidth - (x + elementWidth)
  const distToTop = y
  const distToBottom = windowHeight - (y + elementHeight)

  const horizontalEdge = distToLeft < distToRight ? "left" : "right"
  const verticalEdge = distToTop < distToBottom ? "top" : "bottom"

  const horizontalOffset = horizontalEdge === "left" ? distToLeft : distToRight
  const verticalOffset = verticalEdge === "top" ? distToTop : distToBottom

  return {
    horizontalEdge,
    verticalEdge,
    horizontalOffset,
    verticalOffset,
  }
}
