import type { CrengineView } from "./view.ts"

/** What the pointer is being translated between. */
export type XPointerOptions = {
  /**
   * Write an explicit `[1]` for a sibling that is first of its kind: `/p[1]` rather than
   * `/p`.
   *
   * crengine has always emitted the index for a second or later sibling, and since DOM
   * version 20260812 it emits `[1]` for the first one too, because resolving `p[1]` avoids
   * scanning for following siblings. Xpointers written by older crengine leave `[1]` out
   * when nothing else of that kind follows — pass `false` to produce those. Both forms
   * resolve identically.
   *
   * @defaultValue `true`
   */
  readonly explicitFirstIndex?: boolean

  /**
   * This tree as crengine rendered it.
   *
   * crengine's indexes count its tree, not the parse: whitespace-only text at an inline-run
   * edge has been removed, and text has been rewritten while parsing. Without a view the
   * tree is taken exactly as parsed, which is right only for a tree crengine never produced
   * — and for a pointer crengine wrote, that is not the same answer.
   *
   * A view is exact when it was built from the same stylesheets, in the same order, at the
   * same page width the reader used.
   */
  readonly view?: CrengineView
}
