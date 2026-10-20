import {
  type Document,
  type Node,
  getXhtmlBody,
  isText,
  isElement,
} from "@storyteller-platform/epub"

export function characterCountToNode(
  doc: Document,
  chars: number,
): { node: Node; offset: number } | null {
  const body = getXhtmlBody(doc)

  const stack = [...body.childNodes]
  let last: Node | undefined
  let head: Node | undefined
  let remaining = chars
  while ((head = stack.shift())) {
    last = head
    if (isText(head)) {
      if (remaining < head.data.length) {
        return { node: head, offset: remaining }
      }
      remaining -= head.data.length
      continue
    }
    if (!isElement(head)) continue
    if (head.childNodes.length) {
      stack.unshift(...head.childNodes)
    } else if (remaining < 1) {
      return { node: head, offset: 0 }
    } else {
      // Leaf elements increment the "char" count by 1
      remaining -= 1
    }
  }

  if (!last) return null

  return {
    node: last,
    offset: Math.min(
      remaining,
      last.childNodes.length ? (last.textContent?.length ?? 0) : 1,
    ),
  }
}
