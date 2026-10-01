import {
  type Element,
  isElement,
  isText,
  type Node as DomNode,
} from "@storyteller-platform/epub"

import {
  FootnoteNode,
  Mark,
  Node,
  Root,
  TextNode,
  descendants,
} from "./model.ts"
import { BLOCKS } from "./semantics.ts"

export function parseDom(body: Element) {
  const parser = new Parser()
  return parser.parseDom(body)
}

const FOOTNOTE_ROLES = ["footnote", "rearnote", "endnote", "note"]

/**
 * Snapshot an element's attributes. The markup model stores attributes as a
 * plain record and re-serializes them, unlike the rest of the codebase, which
 * reads them in place with `getAttribute()`.
 */
function attributeRecord(element: Element): Record<string, string> {
  return Object.fromEntries(
    Array.from(element.attributes).map((attr) => [attr.name, attr.value]),
  )
}

class Parser {
  private footnoteIds = new Set<string>()

  parseDom(body: Element) {
    const children = this.parseDomChildren(Array.from(body.childNodes))
    return new Root(children)
  }

  parseDomChildren(xml: DomNode[], pos = 0) {
    const children: (Node | TextNode)[] = []
    for (const child of xml) {
      const result = this.parseDomNode(child, pos)
      const nodes = Array.isArray(result) ? result : [result]
      children.push(...nodes)
      pos += nodes.reduce((acc, node) => acc + node.nodeSize, 0)
    }

    return children
  }

  parseDomNode(
    xmlNode: DomNode,
    pos: number,
    marks?: Mark[],
  ): Node | TextNode | (Node | TextNode)[] {
    if (isText(xmlNode)) {
      return new TextNode(xmlNode.data, marks)
    }

    // Comments and other non-element nodes are dropped here because
    // fast-xml-parser discarded them at parse time. Emitting a model node for
    // one would shift every character offset after it.
    if (!isElement(xmlNode)) return []

    const tagName = xmlNode.nodeName
    const attrs = attributeRecord(xmlNode)
    if (tagName === "a" && attrs["epub:type"] === "noteref") {
      const href = attrs["href"]
      const fragment = href?.split("#")[1]
      if (fragment) {
        this.footnoteIds.add(fragment)
      }
    }

    if (
      attrs["id"] &&
      (FOOTNOTE_ROLES.includes(attrs["epub:type"] ?? "") ||
        // Some footnotes aren't properly marked up with the
        // correct role
        this.footnoteIds.has(attrs["id"]))
    ) {
      const blockChildren = this.parseDomChildren(
        Array.from(xmlNode.childNodes),
        pos + 1,
      )

      const footnoteNode = new FootnoteNode(
        tagName,
        {
          // Fall back to 'footnote' if role
          // is missing
          "epub:type": "footnote",
          ...attrs,
        },
        blockChildren,
        marks,
      )

      return footnoteNode
    }

    if (BLOCKS.includes(tagName)) {
      const blockChildren = this.parseDomChildren(
        Array.from(xmlNode.childNodes),
        pos + 1,
      )

      return new Node(tagName, attrs, blockChildren, marks)
    }

    if (!xmlNode.childNodes.length) {
      return new Node(tagName, attrs, [], marks)
    }

    return Array.from(xmlNode.childNodes).flatMap((child) =>
      this.parseDomNode(child, pos, [
        ...(marks ?? []),
        new Mark(tagName, attrs),
      ]),
    )
  }
}

export function findFootnotePairs(root: Root) {
  const noterefs = new Map<string, number>()
  const pairs = new Map<number, number>()

  descendants(root, (node, pos) => {
    const mark = node.marks.find((mark) => mark.tagName === "a")
    if (mark) {
      const id = mark.attrs["href"]?.split("#")[1]
      if (id) {
        const $pos = root.resolve(pos)

        let d = $pos.depth
        while (d > 0) {
          const node = $pos.node(d)
          if (node instanceof FootnoteNode) {
            return false
          }
          d--
        }

        noterefs.set(id, pos)
      }
      return false
    }

    if (node instanceof FootnoteNode) {
      const id = node.attrs["id"]
      if (id) {
        const noterefPos = noterefs.get(id)
        if (noterefPos !== undefined) {
          pairs.set(noterefPos, pos)
        }
      }
      return false
    }

    return true
  })

  return pairs
}
