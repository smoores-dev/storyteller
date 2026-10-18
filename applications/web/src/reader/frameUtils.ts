import { type FrameComms, type FrameManager } from "@readium/navigator"

import { getActiveFrame } from "@/store/readerRegistry"

type ValidFrame = FrameManager & {
  msg: FrameComms
  iframe: HTMLIFrameElement & {
    contentWindow: Window
    contentDocument: Document
  }
}

function isFrameValid(frame: FrameManager | null): frame is ValidFrame {
  if (!frame) return false

  // @ts-expect-error private property
  if (frame.destroyed || frame.hidden) return false

  if (!frame.msg) return false
  if (!frame.iframe.contentWindow) return false
  if (!frame.iframe.contentDocument) return false

  return true
}

/**
 * safely executes an operation on the active frame.
 * handles frame validation and errors internally.
 * returns null if frame is unavailable or operation fails.
 *
 * can optinally provide a frame if you think you know better
 *
 * fn can also be async
 */
export function withActiveFrame<T>(
  fn: (frame: ValidFrame) => T,
  providedFrame?: FrameManager,
): T | null {
  const frame = providedFrame ?? getActiveFrame()
  if (!isFrameValid(frame)) return null

  try {
    return fn(frame)
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("frame") ||
        error.message.includes("destroyed") ||
        error.message.includes("doesn't exist"))
    ) {
      return null
    }
    throw error
  }
}

/**
 * gets the current resource href from the active frame's base element.
 * returns null if frame is unavailable.
 */
export function getResourceHrefFromFrame(): string | null {
  return withActiveFrame((frame) => {
    const baseElement =
      frame.iframe.contentDocument.querySelector<HTMLBaseElement>(
        "base[data-readium=true]",
      )
    if (!baseElement) return null

    const url = baseElement.href
    // strip the api path prefix to get the resource href
    const match = url.match(/\/api\/v\d+\/books\/[^/]+\/(?:read|listen)\/(.+)/)

    return match?.[1] ? decodeURIComponent(match[1]) : null
  })
}

/**
 * sends a message to the frame if available.
 * returns true if message was sent, false otherwise.
 */
export function sendFrameMessage(
  type: Parameters<FrameComms["send"]>[0],
  payload: Parameters<FrameComms["send"]>[1],
): boolean {
  return (
    withActiveFrame((frame) => {
      frame.msg.send(type, payload)
      return true
    }) ?? false
  )
}

/**
 * queries elements at a point in the active frame's document.
 * x and y are iframe-relative coordinates.
 */
export function queryElementsAtPoint(x: number, y: number): Element[] | null {
  return withActiveFrame((frame) => {
    return Array.from(frame.iframe.contentDocument.elementsFromPoint(x, y))
  })
}

/**
 * gets the bounding rect of the iframe in screen coordinates.
 */
export function getIframeRect(): DOMRect | null {
  return withActiveFrame((frame) => frame.iframe.getBoundingClientRect())
}

/**
 * gets the body rect of the iframe's content document.
 */
export function getBodyRect(): DOMRect | null {
  return withActiveFrame((frame) =>
    frame.iframe.contentDocument.body.getBoundingClientRect(),
  )
}

/**
 * clears any text selection in the active frame.
 */
export function clearFrameSelection(): void {
  withActiveFrame((frame) => {
    frame.iframe.contentWindow.document.getSelection()?.removeAllRanges()
  })
}

/**
 * gets a computed style property from the frame's document element.
 */
export function getFrameComputedStyle(property: string): string | null {
  return withActiveFrame((frame) => {
    return frame.iframe.contentWindow
      .getComputedStyle(frame.iframe.contentDocument.documentElement)
      .getPropertyValue(property)
  })
}
