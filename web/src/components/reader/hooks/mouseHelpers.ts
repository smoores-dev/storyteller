/**
 * is better than `e instanceof MouseEvent` because it works with any window
 */
export const isMouseEvent = (e: Event): e is MouseEvent => {
  return (
    e.type === "mousedown" ||
    e.type === "mouseup" ||
    e.type === "click" ||
    e.type === "mousemove" ||
    e.type === "mouseleave" ||
    e.type === "mouseenter" ||
    e.type === "mouseover" ||
    e.type === "mouseout"
  )
}

export const isTouchEvent = (e: Event): e is TouchEvent => {
  return (
    e.type === "touchstart" ||
    e.type === "touchend" ||
    e.type === "touchmove" ||
    e.type === "touchcancel"
  )
}

export const getClientXY = (e: MouseEvent | TouchEvent) => {
  if (isMouseEvent(e)) {
    return [e.clientX, e.clientY]
  } else if (isTouchEvent(e)) {
    if (e.touches[0]) {
      return [e.touches[0].clientX, e.touches[0].clientY]
    }
    if (e.changedTouches[0]) {
      return [e.changedTouches[0].clientX, e.changedTouches[0].clientY]
    }
  }
  return [undefined, undefined]
}
