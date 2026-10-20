import {
  type Document,
  getXhtmlBody,
  isElement,
  isText,
  type Node,
} from "@storyteller-platform/epub"

export function locatorProgressionToNode(
  doc: Document,
  progression: number,
): { node: Node; offset: number } | null {
  const body = getXhtmlBody(doc)

  let total = 0
  let stack = [...body.childNodes]
  let head: Node | undefined
  let lastChar = ""
  while ((head = stack.shift())) {
    if (isText(head)) {
      for (const char of head.data) {
        if (char.match(/\s/) && lastChar.match(/\s/)) {
          continue
        }

        total++
        lastChar = char
      }
      continue
    }
    if (!isElement(head)) continue
    stack.unshift(...head.childNodes)
  }

  let target = Math.floor(total * progression)
  let last: Node | undefined
  stack = [...body.childNodes]
  while ((head = stack.shift())) {
    last = head
    if (target === 0) {
      break
    }
    if (isText(head)) {
      for (const char of head.data) {
        if (char.match(/\s/) && lastChar.match(/\s/)) {
          continue
        }

        target--
        if (target === 0) {
          break
        }
        lastChar = char
      }
      if (target === 0) {
        break
      }
      continue
    }
    if (!isElement(head)) continue
    stack.unshift(...head.childNodes)
  }

  if (!last) return null

  return {
    node: last,
    offset: Math.min(
      target,
      last.childNodes.length ? (last.textContent?.length ?? 0) : 1,
    ),
  }
}
