/**
 * Which `display` and `white-space` crengine would compute for an element.
 *
 * Only these two properties are resolved, because only they change the shape of the tree this
 * library addresses. The precedence is CSS's, and crengine's too:
 *
 * ```text
 * user-agent normal  <  author normal  <  inline style  <  author !important  <  user-agent !important
 * ```
 *
 * The last one surprises people. It follows from crengine keeping the user-agent sheet in a
 * separate stylesheet that it consults after the author sheets, and it is why
 * {@link CrengineStyleSheet} calls that layer `"user-agent"`: passing the reader's tweaks as
 * author CSS would let a book override them.
 */
import {
  type CssRule,
  conditionMatches,
  parseStyleSheet,
  toDisplay,
  toWhiteSpace,
} from "./css.ts"
import { type Display, tagDefaults, type WhiteSpace } from "./defaults.ts"
import type { Element, Node } from "./dom.ts"
import { isElementNode } from "./nodes.ts"
import { compareSpecificity, parseSelector, type Selector } from "./selector.ts"

/** One stylesheet handed to a view. */
export type CrengineStyleSheet = {
  readonly css: string
  /**
   * `"user-agent"` for the reader's own sheet (and KOReader's style tweaks, which reach
   * crengine through that same slot); `"author"` for the book's CSS.
   */
  readonly kind: "user-agent" | "author"
}

type ModelledProperty = "display" | "white-space"

/** One declaration of a modelled property, from a sheet or from a `style=""` attribute. */
type Candidate = {
  property: ModelledProperty
  value: string
  important: boolean
  origin: "user-agent" | "author"
  inline: boolean
  /** `null` for an inline style, which has no selector to match. */
  selector: Selector | null
  /** Position in the sheets, so that a later rule wins a tie. */
  order: number
}

/** The parts of a computed style this library uses. */
export type ComputedStyle = {
  display: Display
  /** The computed `white-space`; `pre` also stands for `pre-wrap` and `break-spaces`. */
  whiteSpace: WhiteSpace
  /**
   * Whether text inside the element is parsed as pre: from the tag table or from a `pre`
   * value. Unlike {@link ComputedStyle.whiteSpace} this is not lost by a `<pre>` whose own
   * computed style says otherwise, which is crengine's real situation — its `<pre>` computes
   * `normal` and still parses its children as pre.
   */
  parseAsPre: boolean
}

/** Parsed sheets, since a view resolves thousands of elements against the same few strings. */
const parsedSheets = new Map<string, CssRule[]>()

function rulesFor(css: string): CssRule[] {
  const cached = parsedSheets.get(css)
  if (cached !== undefined) return cached
  const rules = parseStyleSheet(css)
  parsedSheets.set(css, rules)
  return rules
}

/**
 * Resolve `display` and `white-space` for the elements of one tree.
 *
 * `styleSheets` is in cascade order, later winning over earlier within one origin — for an
 * EPUB that means the chapters in spine order, because crengine appends each chapter's
 * stylesheet as it reaches it. `width` is the page width in CSS pixels, which is what
 * crengine compares `@media (max-width: …)` against (`lvstsheet.cpp:2330`).
 */
export class Cascade {
  readonly #rules: Candidate[] = []
  readonly #cache = new Map<Node, ComputedStyle>()

  constructor(styleSheets: readonly CrengineStyleSheet[] = [], width = 600) {
    let order = 0
    for (const sheet of styleSheets) {
      for (const rule of rulesFor(sheet.css)) {
        if (!conditionMatches(rule.condition, width)) continue
        const declarations = rule.declarations.filter((declaration) =>
          isModelled(declaration.property),
        )
        if (declarations.length === 0) continue
        // A selector this library cannot parse matches nothing, as in crengine; the rule
        // survives through the selectors it does understand.
        const selectors = rule.selectors
          .map((selector) => parseSelector(selector))
          .filter((selector) => selector !== null)
        if (selectors.length === 0) continue
        for (const declaration of declarations) {
          if (!isModelled(declaration.property)) continue
          const property: ModelledProperty = declaration.property
          for (const selector of selectors) {
            this.#rules.push({
              property,
              value: declaration.value,
              important: declaration.important,
              origin: sheet.kind,
              inline: false,
              selector,
              order: order++,
            })
          }
        }
      }
    }
  }

  /** The computed style of `node`; a text node takes its parent's. */
  styleOf(node: Node): ComputedStyle {
    const cached = this.#cache.get(node)
    if (cached !== undefined) return cached
    const style = this.#compute(node)
    this.#cache.set(node, style)
    return style
  }

  #compute(node: Node): ComputedStyle {
    if (!isElementNode(node)) {
      const parent = node.parentNode
      return parent === null
        ? { display: "block", whiteSpace: "normal", parseAsPre: false }
        : this.styleOf(parent)
    }
    const defaults = tagDefaults(node)
    const declaredDisplay = this.#value("display", node)
    const declaredWhiteSpace = this.#value("white-space", node)
    const parent = node.parentNode
    // `white-space` is inherited, `display` is not.
    const inherited = parent === null ? undefined : this.styleOf(parent)
    // `white-space` inherits, but not as in CSS: crengine's element table gives an element a
    // concrete default, and only an `inherit` value (the default in the table) takes the
    // parent's. So a tag default beats inheritance — `<pre>` is pre even inside a normal
    // parent — while a `<span>` inside it inherits pre.
    const whiteSpace: WhiteSpace =
      declaredWhiteSpace === undefined
        ? (defaults.whiteSpace ?? inherited?.whiteSpace ?? "normal")
        : (toWhiteSpace(declaredWhiteSpace) ?? "normal")
    return {
      display:
        declaredDisplay === undefined
          ? defaults.display
          : (toDisplay(declaredDisplay) ?? defaults.display),
      whiteSpace,
      parseAsPre: defaults.parseAsPre === true || whiteSpace === "pre",
    }
  }

  /** The winning declaration's value for `property`, or `undefined` when nothing declares it. */
  #value(property: ModelledProperty, node: Element): string | undefined {
    let best: Candidate | undefined
    for (const candidate of this.#rules) {
      if (candidate.property !== property) continue
      if (!candidate.selector?.matches(node)) continue
      if (best === undefined || wins(candidate, best)) best = candidate
    }
    const inline = inlineDeclaration(node, property)
    if (inline !== undefined && (best === undefined || wins(inline, best))) {
      return inline.value
    }
    return best?.value
  }
}

function isModelled(property: string): property is ModelledProperty {
  return property === "display" || property === "white-space"
}

/** Whether `a` beats `b`: origin and `!important`, then specificity, then order. */
function wins(a: Candidate, b: Candidate): boolean {
  const difference = rank(a) - rank(b)
  if (difference !== 0) return difference > 0
  if (a.selector !== null && b.selector !== null) {
    const specificity = compareSpecificity(
      a.selector.specificity,
      b.selector.specificity,
    )
    if (specificity !== 0) return specificity > 0
  }
  if (a.inline !== b.inline) return a.inline
  return a.order >= b.order
}

/** The cascade layer a declaration sits in, highest last. */
function rank(candidate: Candidate): number {
  if (candidate.important) return candidate.origin === "user-agent" ? 5 : 4
  if (candidate.inline) return 3
  return candidate.origin === "author" ? 2 : 1
}

/** The last declaration of `property` in the element's `style` attribute, if any. */
function inlineDeclaration(
  node: Node,
  property: ModelledProperty,
): Candidate | undefined {
  if (!isElementNode(node)) return undefined
  const style = node.getAttribute("style")
  if (style === null) return undefined
  let found: Candidate | undefined
  for (const part of style.split(";")) {
    const colon = part.indexOf(":")
    if (colon === -1) continue
    if (part.slice(0, colon).trim().toLowerCase() !== property) continue
    let value = part.slice(colon + 1).trim()
    const important = /!\s*important$/i.test(value)
    if (important) value = value.replace(/!\s*important$/i, "").trim()
    if (value.length === 0) continue
    found = {
      property,
      value,
      important,
      origin: "author",
      inline: true,
      selector: null,
      order: Number.MAX_SAFE_INTEGER,
    }
  }
  return found
}
