import { Epub, type ParsedXml, type XmlNode } from "@storyteller-platform/epub"

import { type Node, type Root, TextNode } from "./model.ts"

class Serializer {
  private serializedIds = new Set<string>()

  constructor(private doc: Root) {}

  serialize() {
    return this.serializeDomNodes(this.doc.children)
  }

  serializeDomNode(node: Node | TextNode): XmlNode {
    if (node instanceof TextNode) {
      return Epub.createXmlTextNode(node.text)
    }

    let attrs = node.attrs
    const id = node.attrs["id"]

    // Ensure that each id is only serialized once so that we don't
    // produce an invalid document
    if (id) {
      if (this.serializedIds.has(id)) {
        const { id: _id, ...remaining } = node.attrs
        attrs = remaining
      } else {
        this.serializedIds.add(id)
      }
    }

    return Epub.createXmlElement(
      node.tagName,
      attrs,
      this.serializeDomNodes(node.children),
    )
  }

  serializeDomNodes(nodes: (Node | TextNode)[]): XmlNode[] {
    const partitioned = nodes.reduce<(Node | TextNode)[][]>((acc, child) => {
      const lastPartition = acc.at(-1)
      if (!lastPartition) {
        return [[child]]
      }
      const lastChild = lastPartition.at(-1)
      if (!lastChild) {
        return [...acc.slice(0, acc.length), [child]]
      }

      const childFirstMark = child.marks[0]
      const lastChildFirstMark = lastChild.marks[0]
      if (
        childFirstMark === lastChildFirstMark ||
        childFirstMark?.eq(lastChildFirstMark)
      ) {
        return [
          ...acc.slice(0, acc.length - 1),
          [...lastPartition.slice(0, lastPartition.length), child],
        ]
      }

      return [...acc, [child]]
    }, [])

    const xmlChildren: XmlNode[] = []
    for (const partition of partitioned) {
      xmlChildren.push(...this.serializePartition(partition))
    }

    return xmlChildren
  }

  serializePartition(nodes: (Node | TextNode)[]): XmlNode[] {
    const firstChild = nodes[0]
    if (!firstChild) return []

    const firstMark = firstChild.marks[0]
    if (!firstMark) {
      return nodes.map((child) => this.serializeDomNode(child))
    }

    let attrs = firstMark.attrs
    const id = firstMark.attrs["id"]

    // Ensure that each id is only serialized once so that we don't
    // produce an invalid document
    if (id) {
      if (this.serializedIds.has(id)) {
        const { id: _id, ...remaining } = firstMark.attrs
        attrs = remaining
      } else {
        this.serializedIds.add(id)
      }
    }

    return [
      Epub.createXmlElement(
        firstMark.tagName,
        attrs,
        this.serializeDomNodes(
          nodes.map((node) => node.copy({ marks: node.marks.slice(1) })),
        ),
      ),
    ]
  }
}

export function serializeDom(doc: Root): ParsedXml {
  return new Serializer(doc).serialize()
}
