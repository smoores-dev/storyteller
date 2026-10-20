import { type Document, type Node } from "@storyteller-platform/epub"

export interface DomPoint {
  node: Node
  offset: number
}

export interface DomPointReference {
  rootHref: string
  doc: Document
  domPoint: DomPoint
}
