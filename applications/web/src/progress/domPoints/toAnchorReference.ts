import { isElement, type Node } from "@storyteller-platform/epub"
import { UriFragment } from "@storyteller-platform/uri-fragment"

import { type DomPointReference } from "@/progress/domPoints/domPoint.ts"
import { UriReference } from "@/progress/uriReference.ts"

export function domPointReferenceToAnchorReference(
  domPointRef: DomPointReference,
  isAnchorCandidate?: (anchor: string) => boolean,
): UriReference | null {
  const { node } = domPointRef.domPoint

  const anchor = findNearestAnchor(node, isAnchorCandidate)
  if (!anchor) return null

  const fragment = new UriFragment()
  fragment.setIdentifier("anchor", { value: anchor })

  return new UriReference(domPointRef.rootHref, fragment)
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
