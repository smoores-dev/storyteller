import {
  getXhtmlBody,
  isElement,
  isText,
  type Node,
} from "@storyteller-platform/epub"
import { CharacterRange, UriFragment } from "@storyteller-platform/uri-fragment"

import { type DomPointReference } from "@/progress/domPoints/domPoint.ts"
import { UriReference } from "@/progress/uriReference.ts"

export function domPointReferenceToCharacterReference(
  domPointRef: DomPointReference,
): UriReference | null {
  const { domPoint, doc, rootHref } = domPointRef
  const { node, offset } = domPoint
  const body = getXhtmlBody(doc)

  const stack = [...body.childNodes]
  let head!: Node | undefined
  let chars = 0
  while ((head = stack.shift())) {
    if (head === node) break
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

  if (!head) return null

  chars = chars + Math.min(offset, head.textContent?.length ?? 0)

  const fragment = new UriFragment()
  const range = new CharacterRange()
  range.offset = chars
  fragment.setIdentifier("char", { range })

  return new UriReference(rootHref, fragment)
}
