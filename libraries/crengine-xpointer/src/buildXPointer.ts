import { XPointerError } from "./XPointerError.ts"
import type { Node } from "./dom.ts"
import {
  addressibleChildren,
  isElementNode,
  isTextNode,
  nodeName,
} from "./nodes.ts"
import type { XPointerOptions } from "./options.ts"
import type { XPointerPosition } from "./resolveXPointer.ts"
import { childrenOf, type CrengineView } from "./view.ts"

export type { XPointerOptions } from "./options.ts"

/**
 * Express a position as a crengine "xpointer".
 *
 * `root` must be an ancestor of `position.node` (or the node itself) and plays the part of
 * crengine's root node: it is never named in the result.
 *
 * Throws {@link XPointerError} when the position cannot be expressed — because `root` is
 * not an ancestor of the node, or because the node is neither an element nor a text node.
 * crengine walks off to the top of the document in the first case and writes a silently
 * unresolvable `text()[0]` in the second; failing is deliberate.
 */
export function buildXPointer(
  root: Node,
  position: XPointerPosition,
  options: XPointerOptions = {},
): string {
  const explicitFirstIndex = options.explicitFirstIndex ?? true
  const { view } = options
  const children = childrenOf(view)

  // crengine appends the caret first (lvtinydom.cpp:11626), then walks up.
  let path = caretOf(position, view)
  let current = position.node
  while (current !== root) {
    const parent = current.parentNode
    if (parent === null) {
      throw new XPointerError(
        "buildXPointer: the root is not an ancestor of the node, so no path reaches it",
      )
    }
    if (isElementNode(current)) {
      const name = nodeName(current)
      path = `/${name}${label(parent, current, explicitFirstIndex, (node) => isElementNode(node) && nodeName(node) === name, children)}${path}`
    } else if (isTextNode(current)) {
      path = `/text()${label(parent, current, explicitFirstIndex, isTextNode, children)}${path}`
    } else {
      throw new XPointerError(
        `buildXPointer: crengine cannot address a node of type ${current.nodeType}`,
      )
    }
    current = parent
  }
  return path
}

/**
 * The `.N` suffix, counted the way crengine counts it.
 *
 * For a text node the caret counts crengine's stored text, which it rewrote while parsing
 * (`lvxml.cpp:5904`); for an element it counts crengine's children. Without a view both are
 * simply this tree's.
 */
function caretOf(
  position: XPointerPosition,
  view: CrengineView | undefined,
): string {
  const { node, offset } = position
  if (offset < 0) return ""
  if (view === undefined) return `.${offset}`
  if (isTextNode(node)) {
    if (offset > node.length) {
      throw new XPointerError(
        "buildXPointer: the offset is past the end of the text node",
      )
    }
    return `.${view.toCreOffset(node, offset)}`
  }
  if (isElementNode(node)) {
    const projected = view.children(node)
    if (offset === [...addressibleChildren(node)].length)
      return `.${projected.length}`
    const child = [...addressibleChildren(node)][offset]
    if (child === undefined) {
      throw new XPointerError(
        "buildXPointer: the offset is past the end of the children",
      )
    }
    const index = projected.indexOf(child)
    if (index === -1) {
      throw new XPointerError(
        "buildXPointer: crengine removed the child the offset points at, so it cannot point there",
      )
    }
    return `.${index}`
  }
  return ""
}

/**
 * The `[n]` suffix for `node`, or `""` when it can be left out.
 *
 * The index is the node's 1-based position among the siblings matching `before` — crengine
 * counts matching siblings up to the node and stops there (`getElementIndex`,
 * lvtinydom.cpp:11599), so the index never depends on what follows. Older crengine looked
 * ahead for a matching following sibling and wrote `[1]` when there was one, to keep the
 * string unambiguous; that scan is the cost the 20260812 change removed, so it only runs
 * when asked for.
 */
function label(
  parent: Node,
  node: Node,
  explicitFirstIndex: boolean,
  matches: (node: Node) => boolean,
  children: (node: Node) => readonly Node[],
): string {
  let index = 0
  let after = false
  let following = false
  for (const sibling of children(parent)) {
    if (!matches(sibling)) continue
    if (after) {
      following = true
      break
    }
    index++
    if (sibling === node) {
      after = true
      // Without the legacy form to produce, nothing after the node matters.
      if (explicitFirstIndex) break
    }
  }
  if (index === 0) {
    throw new XPointerError(
      "buildXPointer: the node is not a child of its parent, or the view projects it away",
    )
  }
  return explicitFirstIndex || index > 1 || following ? `[${index}]` : ""
}
