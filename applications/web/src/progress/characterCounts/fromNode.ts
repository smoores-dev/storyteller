import {
  type Document,
  type Node,
  getXhtmlBody,
  isText,
  isElement,
} from "@storyteller-platform/epub"
import { CharacterRange, UriFragment } from "@storyteller-platform/uri-fragment"

import { UriReference } from "@/progress/uriReference.ts"

export function characterCountFromNode(
  doc: Document,
  node: Node,
  offset: number,
): number | null {
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

  return chars + Math.min(offset, head.textContent?.length ?? 0)
}

export function uriReferenceFromCharacterCount(
  resource: string,
  chars: number,
): UriReference {
  const charFragment = new UriFragment()
  const charRange = new CharacterRange()
  charRange.offset = chars
  charFragment.setIdentifier("char", { range: charRange })
  return new UriReference(resource, charFragment)
}
