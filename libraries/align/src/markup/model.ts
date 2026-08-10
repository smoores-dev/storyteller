import { enumerate } from "itertools"

import { type ElementName } from "@storyteller-platform/epub"

import { ResolvedPos } from "./resolvedPos.ts"
import { BLOCKS } from "./semantics.ts"

export class Root {
  constructor(public children: (Node | TextNode)[]) {}

  public isInline = false
  public isBlock = true

  get border() {
    return 0
  }

  get textContent() {
    return this.children.reduce((acc, child) => acc + child.textContent, "")
  }

  get nodeSize(): number {
    return (
      this.border +
      (this.children.reduce((acc, child) => acc + child.nodeSize, 0) || 1) +
      this.border
    )
  }

  get contentSize(): number {
    return this.nodeSize - this.border * 2
  }

  split(at: number): Root {
    const children: (Node | TextNode)[] = []
    let pos = this.border
    for (const child of this.children) {
      if (at > pos && at < pos + child.nodeSize) {
        children.push(
          ...(child instanceof TextNode
            ? child.split(at - pos)
            : [child.split(at - pos)]),
        )
      } else {
        children.push(child)
      }
      pos += child.nodeSize
    }
    return this.copy({ children })
  }
  copy(opts: { children?: (Node | TextNode)[] } = {}) {
    return new Root(opts.children ?? this.children)
  }

  findIndex(pos: number) {
    if (pos === 0) return { index: 0, offset: pos }
    if (pos === this.contentSize) {
      return { index: this.children.length, offset: pos }
    }
    if (pos > this.contentSize || pos < 0) {
      throw new RangeError(`Position ${pos} outside of fragment`)
    }
    for (let i = 0, curPos = 0; ; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const cur = this.children[i]!
      const end = curPos + cur.nodeSize
      if (end >= pos) {
        if (end === pos) return { index: i + 1, offset: end }
        return { index: i, offset: curPos }
      }
      curPos = end
    }
  }

  replace(at: number, withNode: Node) {
    const children: (Node | TextNode)[] = []
    let pos = this.border
    for (const child of this.children) {
      if (at === pos) {
        children.push(withNode)
      } else if (at > pos && at < pos + child.nodeSize) {
        if (child instanceof TextNode) {
          throw new Error("Tried to replace at a position within a text node")
        }
        children.push(child.replace(at - pos, withNode))
      } else {
        children.push(child)
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      pos += children.at(-1)!.nodeSize
    }
    return this.copy({ children })
  }

  cut(pos: number): Node | TextNode | null {
    let currentPos = this.border
    for (const child of this.children) {
      if (pos === currentPos) {
        return child
      }
      if (pos > currentPos && pos < currentPos + child.nodeSize) {
        return child.cut(pos - currentPos)
      }
      currentPos += child.nodeSize
    }
    return null
  }

  resolve(pos: number) {
    return ResolvedPos.resolve(this, pos)
  }
}

export class Node {
  constructor(
    public tagName: ElementName,
    public attrs: Record<string, string> = {},
    public children: (Node | TextNode)[] = [],
    public marks: Mark[] = [],
  ) {}

  get isLeaf() {
    return !this.children.length
  }

  get isInline() {
    return !this.isBlock
  }

  get isBlock() {
    return BLOCKS.includes(this.tagName)
  }

  get border() {
    return this.isLeaf ? 0 : 1
  }

  get nodeSize(): number {
    return (
      this.border +
      (this.children.reduce((acc, child) => acc + child.nodeSize, 0) || 1) +
      this.border
    )
  }

  get contentSize(): number {
    return this.nodeSize - this.border * 2
  }

  get textContent(): string {
    return this.children.reduce((acc, child) => acc + child.textContent, "")
  }

  split(at: number): Node {
    if (at === this.border) return this
    if (at === this.nodeSize - this.border) return this
    const children: (Node | TextNode)[] = []
    let pos = this.border
    for (const child of this.children) {
      if (at > pos && at < pos + child.nodeSize) {
        if (child instanceof TextNode) {
          children.push(...child.split(at - pos))
        } else {
          children.push(child.split(at - pos))
        }
      } else {
        children.push(child)
      }
      pos += child.nodeSize
    }
    return this.copy({ children })
  }

  static instance() {
    return this
  }

  private static create(
    klass: typeof Node,
    ...args: ConstructorParameters<typeof Node>
  ) {
    return new klass(...args)
  }

  copy(
    opts: {
      attrs?: Record<string, string>
      children?: (Node | TextNode)[]
      marks?: Mark[]
    } = {},
  ) {
    return Node.create(
      this.constructor as typeof Node,
      this.tagName,
      opts.attrs ?? this.attrs,
      opts.children ?? this.children,
      opts.marks ?? this.marks,
    )
  }

  replace(at: number, withNode: Node) {
    const children: (Node | TextNode)[] = []
    let pos = this.border
    for (const child of this.children) {
      if (at === pos) {
        children.push(withNode)
      } else if (at > pos && at < pos + child.nodeSize) {
        if (child instanceof TextNode) {
          throw new Error("Tried to replace at a position within a text node")
        }
        children.push(child.replace(at - pos, withNode))
      } else {
        children.push(child)
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      pos += children.at(-1)!.nodeSize
    }
    return this.copy({ children })
  }

  cut(pos: number): Node | TextNode | null {
    let currentPos = this.border
    for (const child of this.children) {
      if (pos === currentPos) {
        return child
      }
      if (pos > currentPos && pos < currentPos + child.nodeSize) {
        return child.cut(pos - currentPos)
      }
      currentPos += child.nodeSize
    }
    return null
  }

  findIndex(pos: number) {
    if (pos === 0) return { index: 0, offset: pos }
    if (pos === this.contentSize) {
      return { index: this.children.length, offset: pos }
    }
    if (pos > this.contentSize || pos < 0) {
      throw new RangeError(`Position ${pos} outside of fragment`)
    }
    for (let i = 0, curPos = 0; ; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const cur = this.children[i]!
      const end = curPos + cur.nodeSize
      if (end >= pos) {
        if (end === pos) return { index: i + 1, offset: end }
        return { index: i, offset: curPos }
      }
      curPos = end
    }
  }
}

export class NoterefNode extends Node {}

export class FootnoteNode extends Node {}

export class Mark {
  constructor(
    public tagName: ElementName,
    public attrs: Record<string, string> = {},
  ) {}

  eq(other: Mark | undefined) {
    if (!other) return false
    if (Object.keys(this.attrs).length !== Object.keys(other.attrs).length)
      return false
    for (const [key, value] of Object.entries(this.attrs)) {
      if (other.attrs[key] !== value) return false
    }
    return this.tagName === other.tagName
  }
}

export class TextNode {
  constructor(
    public text: string,
    public marks: Mark[] = [],
  ) {}

  public isLeaf = true

  public isInline = true

  public isBlock = false

  public border = 0

  get nodeSize(): number {
    return this.text.length
  }

  get contentSize(): number {
    return this.nodeSize
  }

  get textContent() {
    return this.text
  }

  split(at: number): TextNode[] {
    if (at === 0) return [this]
    if (at === this.text.length) return [this]
    return [
      new TextNode(this.text.slice(0, at), this.marks),
      new TextNode(this.text.slice(at), this.marks),
    ]
  }

  copy(opts: { marks?: Mark[] } = {}) {
    return new TextNode(this.text, opts.marks ?? this.marks)
  }

  cut(pos: number) {
    return new TextNode(this.text.slice(pos))
  }
}

export function descendants(
  node: Root | Node,
  cb: (
    node: Node | TextNode,
    pos: number,
    parent: Node | Root,
    index: number,
  ) => boolean,
  pos = 0,
) {
  pos += node.border

  for (const [i, child] of enumerate(node.children)) {
    const descend = cb(child, pos, node, i)
    if (descend && !child.isLeaf) {
      descendants(child as Node, cb, pos)
    }
    pos += child.nodeSize
  }
}
