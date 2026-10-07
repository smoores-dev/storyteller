import { XPointerError } from "./XPointerError.ts"
import { buildXPointer } from "./buildXPointer.ts"
import type { Document, Node } from "./dom.ts"
import { isElementNode, nodeName } from "./nodes.ts"
import type { XPointerOptions } from "./options.ts"
import { parseXPointerSteps } from "./parseXPointerSteps.ts"
import { resolveSteps, type XPointerPosition } from "./resolveXPointer.ts"
import type { XPointerStep } from "./steps.ts"

/** The element crengine puts one spine item inside, when styles are on. */
const FRAGMENT = "DocFragment"

/** One chapter of a book, addressed by its position in the spine. */
export type ChapterOptions = XPointerOptions & {
  /**
   * Where this chapter sits in the spine, 0-based — the index into the list
   * `getSpineItems()` returns.
   *
   * crengine resolves a pointer against the whole book, which it merges into one document with
   * one `DocFragment` per spine item, so a chapter pointer names that fragment: the second
   * item's pointers start `/body[1]/DocFragment[2]/body[1]`. Note the fragment is numbered
   * from 1 in a path while its id prefix is numbered from 0 (`_doc_fragment_1`), and that a
   * pointer for another chapter is rejected rather than resolved here anyway.
   */
  readonly spineIndex: number
}

/**
 * Resolve a pointer made by crengine for a whole book against one chapter of it.
 *
 * `chapter` is the parsed chapter — its document, its document element or its `<body>`: all
 * three find the same body. The `body/DocFragment/body` prefix is checked against
 * `spineIndex` and dropped; everything after it resolves as {@link resolveXPointer} would,
 * rooted at the chapter's `<body>`.
 *
 * Returns `null` when the pointer does not address this chapter, or when it cannot be
 * resolved in it. A `#id` pointer always returns `null`: crengine rewrites the ids of a
 * chapter's elements to `_doc_fragment_N_ ` + id — with a trailing space, and so different
 * from the source — and never writes `#` itself, so a source id cannot be looked up in a
 * loaded book.
 *
 * Like {@link resolveXPointer}, pass a {@link CrengineView} built from the book's stylesheets
 * and the reader's page width, or the path counts children crengine does not count.
 */
export function resolveChapterXPointer(
  chapter: Document | Node,
  xpointer: string,
  options: ChapterOptions,
): XPointerPosition | null {
  if (xpointer.length === 0 || xpointer[0] === "#") return null
  const steps = parseXPointerSteps(xpointer)
  if (steps === null) return null
  if (!startsAtChapter(steps, options.spineIndex)) return null

  const body = chapterBody(chapter)
  if (body === null) return null
  return resolveSteps(body, steps.slice(3), options)
}

/**
 * Express a position in one chapter as a pointer for the whole book.
 *
 * The inverse of {@link resolveChapterXPointer}: the result carries the
 * `body[1]/DocFragment[n]/body[1]` prefix, so a device resolves it to this position.
 *
 * Throws {@link XPointerError} as {@link buildXPointer} does.
 */
export function buildChapterXPointer(
  chapter: Document | Node,
  position: XPointerPosition,
  options: ChapterOptions,
): string {
  const body = chapterBody(chapter)
  if (body === null) {
    throw new XPointerError(
      "buildChapterXPointer: the chapter has no body element",
    )
  }
  const prefix = `/body[1]/${FRAGMENT}[${options.spineIndex + 1}]/body[1]`
  return `${prefix}${buildXPointer(body, position, options)}`
}

/** Whether the path begins `/body[?]/DocFragment[spineIndex + 1]/body[?]`. */
function startsAtChapter(
  steps: readonly XPointerStep[],
  spineIndex: number,
): boolean {
  const [first, second, third] = steps
  if (first === undefined || second === undefined || third === undefined)
    return false
  if (!isNamedStep(first, "body")) return false
  if (!isNamedStep(third, "body")) return false
  if (second.kind !== "element" || second.name !== FRAGMENT) return false
  return second.index === spineIndex + 1
}

function isNamedStep(step: XPointerStep, name: string): boolean {
  return step.kind === "element" && step.name === name
}

/** The `<body>` of a chapter, given its document, document element or body. */
function chapterBody(chapter: Document | Node): Node | null {
  const root = "documentElement" in chapter ? chapter.documentElement : chapter
  if (root === null) return null
  if (isElementNode(root) && nodeName(root) === "body") return root
  for (let child = root.firstChild; child !== null; child = child.nextSibling) {
    if (isElementNode(child) && nodeName(child) === "body") return child
  }
  return null
}
