import type { Node } from "./dom.ts"
import {
  addressibleChildren,
  isElementNode,
  isTextNode,
  nodeName,
  nodeText,
} from "./nodes.ts"
import type { XPointerOptions } from "./options.ts"
import { parseXPointerSteps } from "./parseXPointerSteps.ts"
import type { XPointerStep } from "./steps.ts"
import { childrenOf } from "./view.ts"

/**
 * Where a crengine "xpointer" points.
 *
 * `offset` is the caret: a character offset into a text node, or a child index into an
 * element. `offset` is `-1` when the xpointer is a path with no caret — crengine's
 * "path vs pointer" distinction (`ldomXPointer::isPath()`/`isPointer()`).
 */
export type XPointerPosition = {
  readonly node: Node
  readonly offset: number
}

/**
 * The options accepted by this function; shared with buildXPointer.
 */
export type { XPointerOptions } from "./options.ts"

/**
 * Turn a crengine "xpointer" into the position it addresses.
 *
 * `root` plays the part of crengine's root node: the first step is looked up among its
 * children, and the root itself is never part of the string. For a document, pass the
 * document — its document element is then the `/html[1]` of the path. To address one chapter
 * of a book with a pointer made for the merged document, use
 * {@link resolveChapterXPointer}, which strips the `DocFragment` prefix.
 *
 * Returns `null` for anything crengine resolves to a null pointer: a malformed path, a
 * step that matches nothing, a caret past the end of the node. crengine makes no further
 * distinction, so neither does this.
 *
 * `xpointer` may also be the `#id` form, which crengine resolves before it looks at the
 * path grammar at all (lvtinydom.cpp:10040): it matches the `id` attribute of any element,
 * or the `name` attribute of an `<a>`, anywhere in the owning document — last in document
 * order wins, because crengine fills its id map while parsing.
 */
export function resolveXPointer(
  root: Node,
  xpointer: string,
  options: XPointerOptions = {},
): XPointerPosition | null {
  if (xpointer.length === 0) return null
  if (xpointer[0] === "#") return resolveById(root, xpointer.slice(1))

  const steps = parseXPointerSteps(xpointer)
  if (steps === null) return null

  return resolveSteps(root, steps, options)
}

/**
 * Walk an already parsed path.
 *
 * Internal to the package: {@link resolveChapterXPointer} needs to drop the merged-document
 * prefix from a parsed path, and re-serialising it to reparse it would be silly.
 */
export function resolveSteps(
  root: Node,
  steps: readonly XPointerStep[],
  options: XPointerOptions = {},
): XPointerPosition | null {
  const { view } = options
  const children = childrenOf(view)

  let current = root
  for (const step of steps) {
    switch (step.kind) {
      case "element": {
        const found = nthChild(
          current,
          step.index,
          (node) => isElementNode(node) && nodeName(node) === step.name,
          children,
        )
        if (found === null) return null
        current = found
        break
      }
      case "text": {
        const found = nthChild(current, step.index, isTextNode, children)
        if (found === null) return null
        current = found
        break
      }
      case "child": {
        const found = nthChild(current, step.index, () => true, children)
        if (found === null) return null
        current = found
        break
      }
      case "offset": {
        // crengine bounds the caret against the child count for an element and against the
        // text length for a text node, inclusively at both ends (lvtinydom.cpp:11472-11487).
        if (isElementNode(current)) {
          if (step.offset > children(current).length) return null
          if (view === undefined) return { node: current, offset: step.offset }
          // The caret counted crengine's children; the caller wants an index into ours.
          const projected = view.children(current)
          const child =
            step.offset === projected.length
              ? undefined
              : projected[step.offset]
          return {
            node: current,
            offset:
              child === undefined
                ? [...addressibleChildren(current)].length
                : [...addressibleChildren(current)].indexOf(child),
          }
        }
        if (isTextNode(current)) {
          const length =
            view === undefined
              ? nodeText(current).length
              : view.textLength(current)
          if (step.offset > length) return null
          return {
            node: current,
            offset:
              view === undefined
                ? step.offset
                : view.toSourceOffset(current, step.offset),
          }
        }
        return null
      }
    }
  }
  return { node: current, offset: -1 }
}

/**
 * The `index`-th child satisfying `matches`, 1-based; `index === -1` takes the first.
 *
 * crengine's `getNodeByIndex` (lvtinydom.cpp:11315). An index of `0` matches nothing, which
 * is why `/p[0]` fails to resolve rather than meaning "none" or "last".
 */
function nthChild(
  root: Node,
  index: number,
  matches: (node: Node) => boolean,
  children: (node: Node) => readonly Node[],
): Node | null {
  let count = 0
  for (const child of children(root)) {
    if (!matches(child)) continue
    count++
    if (index === -1 || count === index) return child
  }
  return null
}

function resolveById(root: Node, id: string): XPointerPosition | null {
  const scope = root.ownerDocument ?? root
  let found: Node | null = null
  for (const node of descendants(scope)) {
    if (!isElementNode(node)) continue
    const named = nodeName(node) === "a" ? node.getAttributeNode("name") : null
    if (node.getAttributeNode("id")?.value === id || named?.value === id)
      found = node
  }
  return found === null ? null : { node: found, offset: -1 }
}

function* descendants(root: Node): Generator<Node> {
  // Pre-order, iterative so that deep documents cannot overflow the stack.
  const stack: Node[] = [root]
  while (stack.length > 0) {
    const node = stack.pop()
    if (node === undefined) break
    yield node
    const children: Node[] = []
    for (
      let child = node.firstChild;
      child !== null;
      child = child.nextSibling
    ) {
      children.push(child)
    }
    // Pushed in reverse so the stack yields the children in document order.
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i]
      if (child !== undefined) stack.push(child)
    }
  }
}
