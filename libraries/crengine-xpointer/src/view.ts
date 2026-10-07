/**
 * A view of a parsed tree shaped like crengine's rendered one.
 *
 * crengine's tree and a plain XML parse differ in three ways, none of them visible in the
 * source markup:
 *
 * 1. text is rewritten while parsing (see {@link text.ts});
 * 2. boxing nodes (`autoBoxing`, `inlineBox`, …) appear around inline runs, and xpointers
 *    never name them, so a view must hide them — a parsed tree has none to begin with;
 * 3. whitespace-only text nodes at the edge of an inline run are deleted while rendering,
 *    unless the parent is `white-space: pre`.
 *
 * A view applies 1 and 3 from the cascade, so that {@link resolveXPointer} and
 * {@link buildXPointer} can work against a tree that crengine never parsed. Without the same
 * stylesheets and page width the caller has no more claim to crengine's answer than the
 * default view does — the view is where that dependency becomes an argument.
 */
import { Cascade, type CrengineStyleSheet } from "./cascade.ts"
import { isBlockDisplay, stripsLeadingNewline } from "./defaults.ts"
import type { Node, Text } from "./dom.ts"
import { addressibleChildren, isElementNode, isTextNode } from "./nodes.ts"
import { crengineText, type CrengineText } from "./text.ts"

export type CrengineViewOptions = {
  /**
   * The sheets that produced the tree, in cascade order: the reader's sheet as
   * `"user-agent"`, then the book's in the order crengine applied them.
   */
  readonly styleSheets?: readonly CrengineStyleSheet[] | undefined
  /**
   * The page width in CSS pixels, which decides `@media (max-width: …)`. Default 600.
   */
  readonly screenWidth?: number | undefined
}

/** A tree as crengine sees it. */
export type CrengineView = {
  /** The children an xpointer counts, in order. */
  children(node: Node): Node[]
  /** The text crengine stores for `node`, plus the caret conversions. */
  textOf(node: Text): CrengineText
  /** The length crengine measures for `node`. */
  textLength(node: Text): number
  /** A caret from a crengine xpointer, as an index into the caller's text node. */
  toSourceOffset(node: Text, creOffset: number): number
  /** An index into the caller's text node, as a caret in a crengine xpointer. */
  toCreOffset(node: Text, sourceOffset: number): number
}

/**
 * The children a step counts: this tree, or crengine-s view of it.
 *
 * Exported for the resolver and the builder, which must count identically or a pointer will
 * not survive a round trip.
 */
export function childrenOf(
  view: CrengineView | undefined,
): (node: Node) => readonly Node[] {
  return view === undefined
    ? (node) => [...addressibleChildren(node)]
    : (node) => view.children(node)
}

/** Whitespace-only text, as crengine's `isWhitespaceText()` decides it (`lvtinydom.cpp:6000`). */
function isWhitespaceText(node: Node): boolean {
  return isTextNode(node) && /^[\s]*$/.test(node.data)
}

/**
 * Build a view. Cheap: the sheets are parsed once and the cascade is memoized per element, so
 * one view can be reused for every pointer of one document.
 */
export function crengineView(options: CrengineViewOptions = {}): CrengineView {
  const cascade = new Cascade(
    options.styleSheets ?? [],
    options.screenWidth ?? 600,
  )
  const texts = new Map<Node, CrengineText>()
  const children = new Map<Node, Node[]>()

  const view: CrengineView = {
    children: (node: Node): Node[] => {
      const cached = children.get(node)
      if (cached !== undefined) return cached
      const projected = project(node)
      children.set(node, projected)
      return projected
    },
    textOf: (node: Text): CrengineText => {
      const cached = texts.get(node)
      if (cached !== undefined) return cached
      const parent = node.parentNode
      if (parent === null) {
        return remember(node, crengineText(node.data))
      }
      // `<pre>` and `<textarea>` lose a newline that opens their body, and only as their first
      // child, which is what crengine's writer flag models (`lvtinydom.cpp:9029`).
      const first = addressibleChildren(parent).next()
      const stripped =
        isElementNode(parent) &&
        stripsLeadingNewline(parent) &&
        (first.done === true || first.value === node)
      return remember(
        node,
        crengineText(node.data, cascade.styleOf(parent).parseAsPre, stripped),
      )
    },
    textLength: (node: Text): number => view.textOf(node).text.length,
    toSourceOffset: (node: Text, creOffset: number): number =>
      view.textOf(node).sourceOffset(creOffset),
    toCreOffset: (node: Text, sourceOffset: number): number =>
      view.textOf(node).creOffset(sourceOffset),
  }
  return view

  /** Remember a node's rewritten text, so that a whole document rewrites each node once. */
  function remember(node: Node, text: CrengineText): CrengineText {
    texts.set(node, text)
    return text
  }

  /**
   * The children of `node` that survive rendering: nothing is dropped inside `white-space:
   * pre`, and inside a block, whitespace-only text at the start of an inline run goes, as does
   * a run that is nothing but whitespace.
   */
  function project(node: Node): Node[] {
    const style = cascade.styleOf(node)
    const all = [...addressibleChildren(node)]
    if (style.whiteSpace === "pre") return all
    // The boxing pass that removes the whitespace only runs for a parent that renders as a
    // block; inside an inline element the whitespace stays where it was written.
    if (!isBlockDisplay(style.display)) return all

    const out: Node[] = []
    let run: Node[] = []
    // A run that ends at a block loses the whitespace that separated it from that block; a
    // run that ends the parent keeps it, which is what crengine's own trimming leaves there.
    const flush = (followedByBlock: boolean): void => {
      if (run.length === 0) return
      let start = 0
      let end = run.length
      while (start < end && isWhitespaceText(run[start] as Node)) start++
      if (followedByBlock) {
        while (end > start && isWhitespaceText(run[end - 1] as Node)) end--
      }
      // A run of nothing but whitespace is removed whole.
      if (start < end) out.push(...run.slice(start, end))
      run = []
    }
    for (const child of all) {
      if (isElementNode(child) && !isInlineForBoxing(child, cascade)) {
        flush(true)
        out.push(child)
        continue
      }
      run.push(child)
    }
    flush(false)
    return out
  }
}

/**
 * Whether crengine folds this element into an inline run.
 *
 * `isInlineNode()` asks the renderer for `erm_inline` (`lvtinydom.cpp:6146`), which
 * `inline-block`, `table` and the table parts do not get: they separate runs the way blocks
 * do, whatever the keyword suggests.
 */
function isInlineForBoxing(node: Node, cascade: Cascade): boolean {
  return !isBlockDisplay(cascade.styleOf(node).display)
}
