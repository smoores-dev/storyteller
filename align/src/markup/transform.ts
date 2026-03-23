import { Mapping, StepMap } from "./map.ts"
import {
  type Mark,
  type Node,
  type Root,
  TextNode,
  descendants,
} from "./model.ts"

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
    if (node.isBlock) {
      return !!node.textContent.match(/\S/)
    }
    if (!(node instanceof TextNode)) return true
    if (mapping.map(pos) - mapping.map(lastTextEnd)) {
      mapping.appendMap(
        new StepMap([
          mapping.map(lastTextEnd),
          mapping.map(pos) - mapping.map(lastTextEnd),
          0,
        ]),
      )
    }

    lastTextEnd = pos + node.nodeSize

    let result = node.text.replaceAll(/\n/g, " ")

    const hasBlockSiblings = parent.children.some((child) => child.isBlock)

    if (hasBlockSiblings && !result.match(/\S/)) {
      mapping.appendMap(new StepMap([textLength, result.length, 0]))
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
