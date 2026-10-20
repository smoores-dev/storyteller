import {
  getXhtmlBody,
  isElement,
  type Node,
  type Document,
} from "@storyteller-platform/epub"

import { type DomPoint } from "@/progress/domPoints/domPoint.ts"

export function domPointFromAnchor(
  doc: Document,
  anchor: string,
): DomPoint | null {
  const body = getXhtmlBody(doc)
  const stack = [...body.childNodes]
  let head!: Node | undefined
  while ((head = stack.shift())) {
    if (!isElement(head)) continue
    if (head.getAttribute("id") === anchor) {
      break
    }
    stack.unshift(...head.childNodes)
  }

  if (!head) return null

  return { node: head, offset: 0 }
}
