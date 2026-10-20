import { relative, dirname } from "node:path/posix"

import {
  type EpubReader,
  type Node,
  parse,
  isElement,
} from "@storyteller-platform/epub"
import { UriFragment } from "@storyteller-platform/uri-fragment"

import { characterCountToNode } from "@/progress/characterCounts/toNode.ts"
import { UriReference } from "@/progress/uriReference.ts"

export async function characterCountToAnchorRef(
  epub: EpubReader,
  resource: string,
  chars: number,
  isAnchorCandidate?: (anchor: string) => boolean,
): Promise<UriReference | null> {
  const href = relative(dirname(await epub.getRootfile()), resource)
  const contents = await epub.readFileContents(href, undefined, "utf-8")
  const doc = parse(contents, "application/xhtml+xml")

  const position = characterCountToNode(doc, chars)
  if (!position) return null

  const { node } = position

  const anchor = findNearestAnchor(node, isAnchorCandidate)
  if (!anchor) return null

  const fragment = new UriFragment()
  fragment.setIdentifier("anchor", { value: anchor })

  return new UriReference(resource, fragment)
}

function findNearestAnchor(
  node: Node,
  isAnchorCandidate?: (anchor: string) => boolean,
): string | null {
  for (
    let element = isElement(node) ? node : node.parentElement;
    element;
    element = element.parentElement
  ) {
    const id = element.getAttribute("id")
    if (id && (!isAnchorCandidate || isAnchorCandidate(id))) {
      return id
    }
  }

  for (
    let previous = previousNode(node);
    previous;
    previous = previousNode(previous)
  ) {
    if (!isElement(previous)) continue

    const id = previous.getAttribute("id")
    if (id && (!isAnchorCandidate || isAnchorCandidate(id))) {
      return id
    }
  }

  return null
}

function previousNode(node: Node): Node | null {
  const sibling = node.previousSibling
  if (sibling) {
    let last: Node = sibling
    while (last.lastChild) {
      last = last.lastChild
    }
    return last
  }

  return node.parentNode
}
