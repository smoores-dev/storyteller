/**
 * The parsed form of a crengine "xpointer" path.
 *
 * `index` is the 1-based position of the step, or `-1` when the string carries no
 * explicit index (crengine's "no index" value, `index == -1` in `ParseXPathStep`).
 */
export type XPointerElementStep = {
  readonly kind: "element"
  /** Local name, without a namespace prefix. */
  readonly name: string
  readonly index: number
}

/** A `text()` step: the n-th text child. */
export type XPointerTextStep = {
  readonly kind: "text"
  readonly index: number
}

/** A `/N` step: the n-th child of any kind. */
export type XPointerChildStep = {
  readonly kind: "child"
  readonly index: number
}

/**
 * A `.N` step: the caret — a character offset into a text node, or a child index into an
 * element. Only legal as the last step of a path.
 */
export type XPointerOffsetStep = {
  readonly kind: "offset"
  readonly offset: number
}

export type XPointerStep =
  | XPointerElementStep
  | XPointerTextStep
  | XPointerChildStep
  | XPointerOffsetStep
