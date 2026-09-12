import { type Node, type Root, TextNode } from "./model.ts"

export class ResolvedPos {
  depth: number

  private constructor(
    readonly pos: number,
    readonly path: (Node | Root | number)[],
    readonly parentOffset: number,
  ) {
    this.depth = path.length / 3 - 1
  }

  static resolve(doc: Root, pos: number) {
    if (!(pos >= 0 && pos <= doc.nodeSize - doc.border * 2)) {
      throw new RangeError(`Position ${pos} out of range`)
    }

    const path: (Node | Root | number)[] = []
    let start = 0
    let parentOffset = pos

    for (let node: Node | TextNode | Root = doc; ;) {
      const { index, offset } = node.findIndex(parentOffset)
      const rem = parentOffset - offset
      path.push(node, index, start + offset)
      if (!rem) break
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      node = node.children[index]!
      if (node instanceof TextNode) break
      parentOffset = rem - 1
      start += offset + 1
    }
    return new ResolvedPos(pos, path, parentOffset)
  }

  get parent() {
    return this.node(this.depth) as Root | Node
  }

  node(depth?: number | null) {
    return this.path[this.resolveDepth(depth) * 3] as Root | Node | TextNode
  }

  index(depth?: number | null) {
    return this.path[this.resolveDepth(depth) * 3 + 1] as number
  }

  get nodeAfter(): Node | TextNode | null {
    const parent = this.parent
    const index = this.index(this.depth)
    if (index === parent.children.length) return null
    const dOff = this.pos - (this.path.at(-1) as number)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const child = parent.children[index]!
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return dOff ? parent.children[index]!.cut(dOff) : child
  }

  before(depth?: number | null): number {
    depth = this.resolveDepth(depth)

    if (!depth) {
      throw new Error("There is no position before the top-level node")
    }

    return depth == this.depth + 1
      ? this.pos
      : (this.path[depth * 3 - 1] as number)
  }

  private resolveDepth(val: number | undefined | null) {
    if (val == null) return this.depth
    if (val < 0) return this.depth + val
    return val
  }
}
