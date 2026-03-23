import { Epub, type ParsedXml, type XmlNode } from "@storyteller-platform/epub"

import { type Node, type Root, TextNode } from "./model.ts"

export function serializeDom(doc: Root): ParsedXml {
  return doc.children.map((child) => serializeDomNode(child))
}

export function serializeDomNode(node: Node | TextNode): XmlNode {
  if (node instanceof TextNode) {
    return Epub.createXmlTextNode(node.text)
  }

  return Epub.createXmlElement(
    node.tagName,
    node.attrs,
    serializeDomNodes(node.children),
  )
}

function serializeDomNodes(nodes: (Node | TextNode)[]): XmlNode[] {
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
    xmlChildren.push(...serializePartition(partition))
  }

  return xmlChildren
}

function serializePartition(nodes: (Node | TextNode)[]): XmlNode[] {
  const firstChild = nodes[0]
  if (!firstChild) return []

  const firstMark = firstChild.marks[0]
  if (!firstMark) {
    return nodes.map((child) => serializeDomNode(child))
  }

  return [
    Epub.createXmlElement(
      firstMark.tagName,
      firstMark.attrs,
      serializeDomNodes(
        nodes.map((node) => node.copy({ marks: node.marks.slice(1) })),
      ),
    ),
  ]
}
