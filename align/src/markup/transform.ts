import { Mapping, StepMap } from "./map.ts"
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
  let textLength = 0
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
    if (mapping.map(pos) - mapping.map(lastTextEnd)) {
      mapping.appendMap(
        new StepMap([
          mapping.map(lastTextEnd),
          mapping.map(pos) - mapping.map(lastTextEnd),
          0,
        ]),
      )
    }

    let result = node.text.replaceAll(/\n/g, " ")
    // Skip leading whitespace in text blocks
    if (text.endsWith("\n")) {
      const contentStart = result.match(/\S/u)?.index ?? result.length
      if (contentStart !== 0) {
        result = result.slice(contentStart)
        mapping.appendMap(
          new StepMap([mapping.map(lastTextEnd), contentStart, 0]),
        )
      }
    }

    lastTextEnd = pos + node.nodeSize

    const hasBlockSiblings = parent.children.some((child) => child.isBlock)

    if (hasBlockSiblings && !result.match(/\S/)) {
      if (result.length) {
        mapping.appendMap(new StepMap([textLength, result.length, 0]))
      }
      result = ""
    }

    if (
      parent.isBlock &&
      index === parent.children.length - 1 &&
      !(text + result).endsWith("\n")
    ) {
      result += "\n"
      textLength--
    }

    text += result
    textLength += result.length

    return true
  })
  return { result: text, mapping }
}

export function inlineFootnotes(root: Root) {
  const footnotePairs = findFootnotePairs(root)

  const mapping = new Mapping()

  let transformed = root
  for (const [noterefPos, footnotePos] of footnotePairs.entries()) {
    const noteref = root.resolve(noterefPos).nodeAfter
    const footnote = root.resolve(footnotePos).nodeAfter

    if (!noteref || !(footnote instanceof Node)) continue

    transformed = transformed.replace(mapping.map(noterefPos), footnote)
    mapping.appendMap(
      new StepMap([
        mapping.map(noterefPos),
        noteref.nodeSize,
        footnote.nodeSize,
      ]),
    )
    transformed = transformed.replace(
      mapping.map(footnotePos),
      new Node(footnote.tagName),
    )
    mapping.appendMap(
      new StepMap([mapping.map(footnotePos), footnote.nodeSize, 1]),
    )
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
  for (const [noterefPos, footnotePos] of footnotePairs.entries()) {
    const noteref = original.resolve(noterefPos).nodeAfter
    const footnote = transformed.resolve(mapping.map(noterefPos)).nodeAfter

    if (!(noteref instanceof Node) || !(footnote instanceof Node)) continue

    transformed = transformed.replace(mapping.map(noterefPos), noteref)
    mapping.appendMap(
      new StepMap([
        mapping.map(noterefPos),
        footnote.nodeSize,
        noteref.nodeSize,
      ]),
    )
    transformed = transformed.replace(mapping.map(footnotePos), footnote)
    mapping.appendMap(
      new StepMap([mapping.map(footnotePos), 1, footnote.nodeSize]),
    )
  }

  return transformed
}
