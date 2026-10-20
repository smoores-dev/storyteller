import {
  type Document,
  type Node,
  getXhtmlBody,
  isElement,
  isText,
} from "@storyteller-platform/epub"

export function countAllDocumentCharacters(doc: Document): number {
  const body = getXhtmlBody(doc)

  const stack = [...body.childNodes]
  let head: Node | undefined
  let chars = 0
  while ((head = stack.shift())) {
    if (isText(head)) {
      chars += head.data.length
      continue
    }
    if (!isElement(head)) continue
    if (head.childNodes.length) {
      stack.unshift(...head.childNodes)
    } else {
      // Leaf elements increment the "char" count by 1
      chars += 1
    }
  }

  return chars
}
