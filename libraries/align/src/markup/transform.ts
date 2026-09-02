import { Mapping } from "@storyteller-platform/mapping"

import {
  FootnoteNode,
  type Mark,
  Node,
  type Root,
  TextNode,
  descendants,
} from "./model.ts"
import { findFootnotePairs } from "./parseDom.ts"

export function addMark(root: Root, from: number, to: number, mark: Mark) {
  const result = root.split(from).split(to)
  let pos = 0
  const children: (Node | TextNode)[] = []
  for (const child of result.children) {
    children.push(addMarkToNode(child, pos, from, to, mark))
    pos += child.nodeSize
  }

  return result.copy({ children })
}

function addMarkToNode(
  node: Node | TextNode,
  pos: number,
  from: number,
  to: number,
  mark: Mark,
): Node | TextNode {
  if (from >= pos + node.nodeSize || to <= pos) {
    return node
  }

  if (node.isLeaf) {
    return node.copy({ marks: [mark, ...node.marks] })
  }

  let childPos = node.border
  const children: (Node | TextNode)[] = []
  for (const child of (node as Node).children) {
    children.push(addMarkToNode(child, pos + childPos, from, to, mark))
    childPos += child.nodeSize
  }

  return node.copy({ children })
}

export function liftText(root: Root) {
  const mapping = new Mapping()

  let text = ""
  let lastTextEnd = 0

  descendants(root, (node, pos, parent, index) => {
    if (node instanceof FootnoteNode) {
      if (!text.endsWith("\n")) {
        text += "\n"
      }
    }
    if (node.isBlock) {
      return !!node.textContent.match(/\S/)
    }
    if (!(node instanceof TextNode)) {
      if (
        node.isLeaf &&
        parent.isBlock &&
        index === parent.children.length - 1 &&
        !text.endsWith("\n")
      ) {
        text += "\n"
      }
      return true
    }
    if (node.marks.some((m) => m.tagName === "rp" || m.tagName === "rt")) {
      return false
    }

    if (pos - lastTextEnd) {
      mapping.insertMap(lastTextEnd, pos - lastTextEnd, 0)
    }

    let result = node.text.replaceAll(/\n/g, " ")
    // Skip leading whitespace in text blocks
    if (text.endsWith("\n") || text === "") {
      const contentStart = result.match(/\S/u)?.index ?? result.length
      if (contentStart !== 0) {
        result = result.slice(contentStart)
        mapping.insertMap(pos, contentStart, 0)
      }
    }

    lastTextEnd = pos + node.nodeSize

    const hasBlockSiblings = parent.children.some((child) => child.isBlock)

    if (hasBlockSiblings && !result.match(/\S/)) {
      if (result.length) {
        mapping.insertMap(pos, result.length, 0)
      }
      result = ""
    }

    if (
      parent.isBlock &&
      index === parent.children.length - 1 &&
      !(text + result).endsWith("\n")
    ) {
      // We intentionally don't account for this in the mapping
      // because these get stripped out later. They're only here
      // to force sentence breaks between text blocks.
      result += "\n"
    }

    text += result

    return true
  })
  return { result: text, mapping }
}

export function inlineFootnotes(root: Root) {
  const footnotePairs = findFootnotePairs(root)

  const mapping = new Mapping()

  let transformed = root
  let cursor = mapping.cursor()
  for (const [noterefPos, footnotePos] of footnotePairs.entries()) {
    const noteref = root.resolve(noterefPos).nodeAfter
    const footnote = root.resolve(footnotePos).nodeAfter

    if (!noteref || !(footnote instanceof Node)) continue

    transformed = transformed.replace(cursor.map(noterefPos), footnote)
    mapping.insertMap(noterefPos, noteref.nodeSize, footnote.nodeSize)
    cursor = mapping.cursor()
    transformed = transformed.replace(
      cursor.map(footnotePos),
      new Node(footnote.tagName),
    )
    mapping.insertMap(footnotePos, footnote.nodeSize, 1)
  }

  return { root: transformed, footnotePairs, mapping }
}

export function replaceFootnotes(
  original: Root,
  root: Root,
  footnotePairs: Map<number, number>,
  mapping: Mapping,
) {
  let transformed = root
  let cursor = mapping.cursor()
  for (const [noterefPos, footnotePos] of footnotePairs.entries()) {
    const noteref = original.resolve(noterefPos).nodeAfter
    const footnote = transformed.resolve(cursor.map(noterefPos)).nodeAfter

    if (!(noteref instanceof TextNode) || !(footnote instanceof Node)) continue

    transformed = transformed.replace(cursor.map(noterefPos), noteref)
    mapping.insertMap(noterefPos, footnote.nodeSize, noteref.nodeSize)
    cursor = mapping.cursor()
    transformed = transformed.replace(cursor.map(footnotePos), footnote)
    mapping.insertMap(footnotePos, 1, footnote.nodeSize)
    cursor = mapping.cursor()
  }

  return transformed
}
