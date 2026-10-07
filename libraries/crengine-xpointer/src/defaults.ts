import type { Element } from "./dom.ts"
import { nodeName } from "./nodes.ts"

/**
 * The `display` values this library distinguishes.
 *
 * crengine has its own enum (`cssdef.h:60`), whose order carries meaning: everything above
 * `inline` except `none` is a block for the purposes of text handling. That set is reproduced
 * here from the keywords, because the caller writes CSS, not crengine's numbers.
 */
export type Display =
  | "inline"
  | "block"
  | "inline-block"
  | "list-item"
  | "run-in"
  | "ruby"
  | "inline-table"
  | "table"
  | "table-row-group"
  | "table-header-group"
  | "table-footer-group"
  | "table-row"
  | "table-column-group"
  | "table-column"
  | "table-cell"
  | "table-caption"
  | "flex"
  | "inline-flex"
  | "grid"
  | "inline-grid"
  | "none"

/** `white-space`, reduced to what changes the tree: pre or not. */
export type WhiteSpace = "normal" | "nowrap" | "pre"

const INLINE_LIKE: ReadonlySet<string> = new Set(["inline", "ruby", "run-in"])

/**
 * Whether crengine treats this `display` as a block: `display > css_d_inline && display !=
 * css_d_none` (`lvtinydom.cpp:6029`), which counts `inline-block` and the table parts.
 */
export function isBlockDisplay(display: Display): boolean {
  return !INLINE_LIKE.has(display) && display !== "none"
}

/**
 * Whether crengine wraps this `display` in an automatic box when laying out.
 *
 * `isInlineNode()` asks the renderer, not the cascade: a child counts as inline only when its
 * rendering method is `erm_inline` (`lvtinydom.cpp:6146`), which `inline-block`, `table`,
 * `table-cell` and friends do not get. So they separate runs of inline content the way blocks
 * do, even though "inline-block" reads otherwise.
 */
export function isInlineDisplay(display: Display): boolean {
  return display === "inline"
}

type TagDefaults = {
  readonly display: Display
  readonly whiteSpace?: WhiteSpace | undefined
  /**
   * Whether text inside the element is parsed as pre whatever the cascade says. Only one
   * source: text anywhere inside `<svg>` is forced to pre so it can be serialized back
   * verbatim (`lvtinydom.cpp:6263`). Everywhere else pre-ness follows the computed
   * `white-space`, whose tag defaults are in this table.
   */
  readonly parseAsPre?: boolean | undefined
}

/**
 * Defaults for the two properties that change the shape of crengine's tree.
 *
 * These are hand-written from the HTML rendering defaults, with the differences crengine's own
 * element table and user-agent sheet were measured to make (the measurements live in
 * `tools/crengine-oracle/FINDINGS.md`), not copied from either:
 *
 * - `<li>` measures **inline**, not `list-item`: crengine's table gives it no block display,
 *   so a `<ul>`'s children sit in one inline run.
 * - `<pre>` and `<textarea>` get their pre behaviour from `white-space: pre` in this table, so
 *   an author `white-space: normal` on one does restore collapsing — crengine re-reads the
 *   computed style when it closes the element and clears its parse-as-pre flag accordingly
 *   (`lvtinydom.cpp:6256`).
 * - table parts keep their display types, which the boxing pass treats as separators.
 * - table parts keep their display types, which the boxing pass treats as separators.
 */
const TAG_DEFAULTS: Readonly<Record<string, TagDefaults>> = {
  a: { display: "inline" },
  b: { display: "inline" },
  blockquote: { display: "block" },
  body: { display: "block" },
  br: { display: "inline" },
  caption: { display: "table-caption" },
  code: { display: "inline" },
  col: { display: "table-column" },
  colgroup: { display: "table-column-group" },
  dd: { display: "block" },
  div: { display: "block" },
  dl: { display: "block" },
  dt: { display: "block" },
  em: { display: "inline" },
  footer: { display: "block" },
  h1: { display: "block" },
  h2: { display: "block" },
  h3: { display: "block" },
  h4: { display: "block" },
  h5: { display: "block" },
  h6: { display: "block" },
  head: { display: "none" },
  header: { display: "block" },
  hgroup: { display: "block" },
  hr: { display: "block" },
  html: { display: "block" },
  i: { display: "inline" },
  img: { display: "inline" },
  li: { display: "inline" },
  main: { display: "block" },
  meta: { display: "none" },
  nav: { display: "block" },
  ol: { display: "block" },
  p: { display: "block" },
  pre: { display: "block", whiteSpace: "pre" },
  script: { display: "none" },
  section: { display: "block" },
  source: { display: "none" },
  span: { display: "inline" },
  strong: { display: "inline" },
  style: { display: "none", whiteSpace: "pre" },
  table: { display: "table" },
  tbody: { display: "table-row-group" },
  td: { display: "table-cell" },
  textarea: { display: "block", whiteSpace: "pre" },
  tfoot: { display: "table-footer-group" },
  th: { display: "table-cell" },
  thead: { display: "table-header-group" },
  title: { display: "none" },
  tr: { display: "table-row" },
  ul: { display: "block" },
}

/** crengine falls back to block for anything its element table does not name. */
const FALLBACK: TagDefaults = { display: "block" }

/** The defaults for `element`, before any stylesheet is considered. */
export function tagDefaults(element: Element): TagDefaults {
  const name = nodeName(element)
  return TAG_DEFAULTS[name] ?? (isSvgChild(element) ? SVG_DEFAULTS : FALLBACK)
}

/**
 * Whether crengine strips a newline that comes right after the element's start tag
 * (`lvtinydom.cpp:6049`): `<pre>` and `<textarea>`. It applies to their first child only, and
 * only to one character, which the caller has to check.
 */
export function stripsLeadingNewline(element: Element): boolean {
  const name = nodeName(element)
  return name === "pre" || name === "textarea"
}

const SVG_DEFAULTS: TagDefaults = { display: "inline", parseAsPre: true }

function isSvgChild(element: Element): boolean {
  // SVG's own elements are not in crengine's table, and their text is parsed as pre.
  let parent = element.parentNode
  while (parent !== null && parent.nodeType === 1) {
    if (nodeName(parent as Element) === "svg") return true
    parent = parent.parentNode
  }
  return false
}
