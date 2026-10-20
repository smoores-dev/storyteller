import { relative, dirname } from "node:path/posix"

import {
  type EpubReader,
  parse,
  getXhtmlBody,
  type Node,
  isElement,
} from "@storyteller-platform/epub"

import {
  characterCountFromNode,
  uriReferenceFromCharacterCount,
} from "@/progress/characterCounts/fromNode.ts"
import { type UriReference } from "@/progress/uriReference.ts"

export async function characterReferenceFromAnchor(
  epub: EpubReader,
  resource: string,
  anchor: string,
): Promise<UriReference | null> {
  const href = relative(dirname(await epub.getRootfile()), resource)
  const contents = await epub.readFileContents(href, undefined, "utf-8")
  const doc = parse(contents, "application/xhtml+xml")
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

  const chars = characterCountFromNode(doc, head, 0)
  if (chars === null) return null
  return uriReferenceFromCharacterCount(resource, chars)
}
