import { enumerate } from "itertools"

import { type ElementName } from "@storyteller-platform/epub"

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

  copy(
    opts: {
      attrs?: Record<string, string>
      children?: (Node | TextNode)[]
      marks?: Mark[]
    } = {},
  ) {
    return new Node(
      this.tagName,
      opts.attrs ?? this.attrs,
      opts.children ?? this.children,
      opts.marks ?? this.marks,
    )
  }
}

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
}

export function descendants(
  root: Root | Node,
  cb: (
    node: Node | TextNode,
    pos: number,
    parent: Node | Root,
    index: number,
  ) => boolean,
  pos = 0,
) {
  for (const [i, child] of enumerate(root.children)) {
    const descend = cb(child, pos, root, i)
    if (descend && !child.isLeaf) {
      descendants(child as Node, cb, pos + child.border)
    }
    pos += child.nodeSize
  }
}
