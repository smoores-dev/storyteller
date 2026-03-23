import { Epub, type ParsedXml, type XmlNode } from "@storyteller-platform/epub"

import { Mark, Node, Root, TextNode } from "./model.ts"
import { BLOCKS } from "./semantics.ts"

export function parseDom(xml: ParsedXml) {
  const children = xml.flatMap((node) => parseDomNode(node))
  return new Root(children)
}

export function parseDomNode(
  xmlNode: XmlNode,
  marks?: Mark[],
): Node | TextNode | (Node | TextNode)[] {
  if (Epub.isXmlTextNode(xmlNode)) {
    return new TextNode(xmlNode["#text"], marks)
  }
  const tagName = Epub.getXmlElementName(xmlNode)
  if (BLOCKS.includes(tagName)) {
    return new Node(
      tagName,
      Epub.getXmlAttributes(xmlNode),
      Epub.getXmlChildren(xmlNode).flatMap((child) => parseDomNode(child)),
      marks,
    )
  }
  if (!Epub.getXmlChildren(xmlNode).length) {
    return new Node(tagName, Epub.getXmlAttributes(xmlNode), [], marks)
  }
  return Epub.getXmlChildren(xmlNode).flatMap((child) =>
    parseDomNode(child, [
      ...(marks ?? []),
      new Mark(tagName, Epub.getXmlAttributes(xmlNode)),
    ]),
  )
}
