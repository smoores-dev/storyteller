import xmldom, { type Document, type Element, type Node } from "@xmldom/xmldom"

import type { XPointerPosition } from "../index.ts"

const { DOMParser } = xmldom

/**
 * Parse a fixture the way `@storyteller-platform/epub` parses XHTML content: no
 * diagnostics, and with the XHTML media type.
 *
 * The media type is not cosmetic. As `application/xml` xmldom reports an HTML named
 * entity as unknown and keeps the characters, so `&nbsp;` stays text where crengine
 * stores one character, and every caret after it counts the markup instead of the
 * character. `application/xhtml+xml` is what `@storyteller-platform/epub` passes for
 * chapter content, and `&unknownent;` still errors there, which is how one without
 * the other is caught.
 *
 * crengine's own HTML parsing — repairing markup an XML parser rejects — is out of
 * scope here, see the README.
 */
export function parseDoc(source: string): Document {
  return new DOMParser({ onError: () => {} }).parseFromString(
    source,
    "application/xhtml+xml",
  )
}

/**
 * A short, comparable description of a resolved position.
 *
 * Fixtures tag the addressable nodes with `id` attributes, so an expectation reads as the
 * node it names (`p2@3` is "the node marked `id="p2"`, caret 3") and never depends on the
 * path builder being correct.
 */
export function label(position: XPointerPosition | null): string {
  if (position === null) return "null"
  const marker =
    position.node.nodeType === 1
      ? (position.node as Element).getAttribute("id")
      : null
  const name = marker ?? position.node.nodeName
  return `${name}@${position.offset}`
}

/** Every addressible node under `root`, in document order. */
export function addressibleNodes(root: Node): Node[] {
  const nodes: Node[] = []
  const visit = (node: Node): void => {
    for (
      let child = node.firstChild;
      child !== null;
      child = child.nextSibling
    ) {
      if (child.nodeType === 1 || child.nodeType === 3 || child.nodeType === 4)
        nodes.push(child)
      visit(child)
    }
  }
  visit(root)
  return nodes
}
