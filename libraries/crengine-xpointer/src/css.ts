/**
 * A tolerant CSS scanner, good enough to find the two properties that matter.
 *
 * The job is deliberately narrow: pull out the declarations of `display` and `white-space`
 * and which elements they claim, and skip everything else without failing on it. crengine's
 * own parser (`lvstsheet.cpp`) is a similar scanner and is likewise permissive — a declaration
 * it cannot parse is dropped rather than rejected — so being forgiving here matches it, and a
 * book with broken CSS should still get pointers rather than an exception.
 */
import type { Display, WhiteSpace } from "./defaults.ts"

export type CssDeclaration = {
  readonly property: string
  readonly value: string
  readonly important: boolean
}

/** A condition from `@media`, evaluated against the render width. */
export type CssCondition =
  | { readonly kind: "unknown" | "media-type"; readonly matched: boolean }
  | {
      readonly kind: "width"
      /** In CSS pixels: crengine compares these with the *page* width (`lvstsheet.cpp:2330`). */
      readonly minWidth?: number | undefined
      readonly maxWidth?: number | undefined
    }

export type CssRule = {
  readonly selectors: string[]
  readonly declarations: CssDeclaration[]
  /** Undefined outside `@media`. */
  readonly condition?: CssCondition | undefined
}

/** Parse `css`, keeping only rules whose declarations can change the tree. */
export function parseStyleSheet(css: string): CssRule[] {
  const rules: CssRule[] = []
  parseBlock(css, 0, css.length, undefined, rules)
  return rules
}

function parseBlock(
  css: string,
  start: number,
  end: number,
  condition: CssCondition | undefined,
  out: CssRule[],
): void {
  let index = start
  while (index < end) {
    const at = css.indexOf("{", index)
    if (at === -1 || at >= end) return
    const head = css.slice(index, at).trim()
    const close = findBlockEnd(css, at, end)
    const body = css.slice(at + 1, close)
    if (head.startsWith("@")) {
      parseAtRule(head, body, condition, out)
    } else {
      const declarations = parseDeclarations(body)
      if (declarations.length > 0) {
        // A selector list can carry a broken member; crengine drops the whole rule if it
        // cannot parse one, so drop the rule rather than apply a guess.
        const selectors = splitSelectors(head)
        if (selectors !== null) out.push({ selectors, declarations, condition })
      }
    }
    index = close + 1
  }
}

function parseAtRule(
  head: string,
  body: string,
  condition: CssCondition | undefined,
  out: CssRule[],
): void {
  const name = /^@([a-z-]+)/i.exec(head)?.[1]?.toLowerCase()
  if (name === "media") {
    const parsed = parseMediaCondition(head.slice(6))
    parseBlock(body, 0, body.length, mergeConditions(condition, parsed), out)
    return
  }
  // @import, @font-face, @page, @supports, @keyframes, @charset, @namespace: none of them can
  // change `display` or `white-space` of an element the way an ordinary rule does. (@font-face
  // and @page cannot; @import would, but crengine resolves imports when it loads a sheet, so a
  // sheet handed to this library has already been flattened.)
}

function mergeConditions(
  outer: CssCondition | undefined,
  inner: CssCondition,
): CssCondition {
  if (outer === undefined) return inner
  if (outer.kind !== "width" || inner.kind !== "width") {
    return outer.kind === inner.kind && outer.kind === "width"
      ? outer
      : { kind: "media-type", matched: false }
  }
  return {
    kind: "width",
    minWidth: Math.max(outer.minWidth ?? 0, inner.minWidth ?? 0),
    maxWidth: Math.min(outer.maxWidth ?? Infinity, inner.maxWidth ?? Infinity),
  }
}

function parseMediaCondition(text: string): CssCondition {
  let minWidth: number | undefined
  let maxWidth: number | undefined
  let sawWidthFeature = false
  // Comma-separated queries are ORed; crengine evaluates them too, but a list is rare enough
  // in books that treating the whole thing as unknown is the honest reading.
  if (text.includes(",")) return { kind: "unknown", matched: false }
  for (const part of text.split(/\band\b/i)) {
    const feature = /^\s*\(\s*([a-z-]+)\s*(:\s*([^)]*))?\)\s*$/i.exec(part)
    if (feature?.[1] === undefined) {
      const type = part.trim().toLowerCase()
      if (type === "" || type === "all" || type === "screen") continue
      // `print` and anything unknown: not applied.
      return { kind: "media-type", matched: false }
    }
    const name = feature[1].toLowerCase()
    const value = feature[3] === undefined ? undefined : pixels(feature[3])
    if (value === undefined) return { kind: "unknown", matched: false }
    if (name === "width") {
      minWidth = value
      maxWidth = value
    } else if (name === "min-width") {
      minWidth = value
    } else if (name === "max-width") {
      maxWidth = value
    } else {
      return { kind: "unknown", matched: false }
    }
    sawWidthFeature = true
  }
  if (!sawWidthFeature) return { kind: "media-type", matched: true }
  return { kind: "width", minWidth, maxWidth }
}

function pixels(text: string): number | undefined {
  const match = /^\s*([0-9.]+)\s*(px)?\s*$/i.exec(text)
  if (match?.[1] === undefined) return undefined
  const value = Number(match[1])
  return Number.isFinite(value) ? value : undefined
}

/** Whether `condition` holds for a page of `width` CSS pixels. */
export function conditionMatches(
  condition: CssCondition | undefined,
  width: number,
): boolean {
  if (condition === undefined) return true
  if (condition.kind !== "width") return condition.matched
  if (condition.minWidth !== undefined && width < condition.minWidth)
    return false
  if (condition.maxWidth !== undefined && width > condition.maxWidth)
    return false
  return true
}

/** `null` when any selector in the list cannot be understood. */
function splitSelectors(head: string): string[] | null {
  const parts: string[] = []
  let depth = 0
  let current = ""
  for (const char of head) {
    if (char === "(" || char === "[") depth++
    if (char === ")" || char === "]") depth--
    if (char === "," && depth === 0) {
      parts.push(current.trim())
      current = ""
      continue
    }
    current += char
  }
  parts.push(current.trim())
  for (const part of parts) if (part.length === 0) return null
  return parts
}

function parseDeclarations(body: string): CssDeclaration[] {
  const out: CssDeclaration[] = []
  for (const part of body.split(";")) {
    const colon = part.indexOf(":")
    if (colon === -1) continue
    const property = part.slice(0, colon).trim().toLowerCase()
    let value = part.slice(colon + 1).trim()
    if (property.length === 0 || value.length === 0) continue
    // Comments inside the block are gone (the scanner skipped them), but a value can still
    // carry one that spanned a semicolon; drop anything after a leftover marker.
    const marker = value.indexOf("/*")
    if (marker !== -1) value = value.slice(0, marker).trim()
    const important = /!\s*important$/i.test(value)
    if (important) value = value.replace(/!\s*important$/i, "").trim()
    out.push({ property, value, important })
  }
  return out
}

/** The index of the `}` closing the block that starts at `open`. */
function findBlockEnd(css: string, open: number, end: number): number {
  let depth = 0
  let index = open
  while (index < end) {
    const char = css[index]
    if (char === "/" && css[index + 1] === "*") {
      const close = css.indexOf("*/", index + 2)
      index = close === -1 ? end : close + 2
      continue
    }
    if (char === "{") depth++
    else if (char === "}") {
      depth--
      if (depth === 0) return index
    }
    index++
  }
  return end
}

/** The display a CSS keyword produces in crengine's classification, or `undefined`. */
export function toDisplay(value: string): Display | undefined {
  switch (value.toLowerCase()) {
    case "block":
      return "block"
    case "inline":
      return "inline"
    case "inline-block":
      return "inline-block"
    case "list-item":
      return "list-item"
    case "none":
      return "none"
    case "run-in":
      return "run-in"
    case "ruby":
      return "ruby"
    case "inline-table":
      return "inline-table"
    case "table":
      return "table"
    case "table-row-group":
      return "table-row-group"
    case "table-header-group":
      return "table-header-group"
    case "table-footer-group":
      return "table-footer-group"
    case "table-row":
      return "table-row"
    case "table-column-group":
      return "table-column-group"
    case "table-column":
      return "table-column"
    case "table-cell":
      return "table-cell"
    case "table-caption":
      return "table-caption"
    case "flex":
      return "flex"
    case "inline-flex":
      return "inline-flex"
    case "grid":
      return "grid"
    case "inline-grid":
      return "inline-grid"
    default:
      // `inherit`, `contents`, vendor values: crengine has no such display type either, and an
      // unknown value is dropped by its parser, leaving the previous value in force.
      return undefined
  }
}

/** The `white-space` a keyword produces, reduced to whether text is parsed as pre. */
export function toWhiteSpace(value: string): WhiteSpace | undefined {
  switch (value.toLowerCase()) {
    case "normal":
    case "-webkit-normal":
      return "normal"
    case "nowrap":
      return "nowrap"
    case "pre":
    case "pre-wrap":
    case "pre-line":
    case "break-spaces":
      return "pre"
    case "inherit":
      return undefined
    default:
      return undefined
  }
}
