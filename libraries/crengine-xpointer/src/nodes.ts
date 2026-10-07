import type { Element, Node, Text } from "./dom.ts"

const ELEMENT_NODE = 1
const TEXT_NODE = 3
const CDATA_SECTION_NODE = 4
const DOCUMENT_NODE = 9

export function isElementNode(node: Node): node is Element {
  return node.nodeType === ELEMENT_NODE
}

export function isDocumentNode(node: Node): node is Node {
  return node.nodeType === DOCUMENT_NODE
}

/**
 * crengine has no CDATA node type: the parser hands `<![CDATA[…]]>` content to the
 * document writer as ordinary text (`TXTFLG_CDATA` in lvxml.cpp), so it becomes a text
 * node there. A CDATA section therefore counts as text here.
 */
export function isTextNode(node: Node): node is Text {
  return node.nodeType === TEXT_NODE || node.nodeType === CDATA_SECTION_NODE
}

/**
 * `true` for the only two node kinds crengine's tree can hold.
 *
 * `LVXMLParserCallback` (lvxml.h) has no comment, processing-instruction or doctype
 * callback, so those never reach crengine's DOM. Ignoring them here means a document
 * parsed by a DOM that *does* keep them still indexes like crengine's equivalent tree.
 */
export function isAddressibleNode(node: Node): boolean {
  return isElementNode(node) || isTextNode(node)
}

/** The children crengine could see in `root`, in document order. */
export function* addressibleChildren(root: Node): Generator<Node> {
  for (let child = root.firstChild; child !== null; child = child.nextSibling) {
    if (isAddressibleNode(child)) yield child
  }
}

/**
 * The element's name, as crengine would write it.
 *
 * crengine matches and prints the *local* name and ignores namespaces entirely
 * (`findChildElement(LXML_NS_ANY, …)`), so `dc:title` is `title` there.
 */
export function nodeName(node: Element): string {
  return node.localName || node.nodeName
}

/** The text of a text node, as crengine measures it (UTF-16 units, as in `lString32`). */
export function nodeText(node: Text): string {
  return node.data
}
