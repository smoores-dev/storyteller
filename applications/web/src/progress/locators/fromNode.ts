import {
  type Document,
  isElement,
  type Node,
  type Element,
} from "@storyteller-platform/epub"

export function locatorCssSelectorFromNode(
  doc: Document,
  node: Node,
): string | null {
  let start: Element | null
  for (let n: Node | null = node; n; n = n.previousSibling) {
    if (isElement(n)) {
      start = n
      break
    }
  }

  start ??= node.parentElement

  if (!start) return null

  const cssSelectorParts: string[] = []
  for (
    let el: Element | null = start;
    el && el !== doc.documentElement;
    el = el.parentElement
  ) {
    const parent = el.parentElement
    if (!parent) break

    const index = parent.children.indexOf(el)
    cssSelectorParts.unshift(`:nth-child(${index + 1})`)
  }

  const cssSelector = cssSelectorParts.join(" > ")

  return cssSelector
}
