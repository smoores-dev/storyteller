import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import {
  type Node,
  type Text,
  type XPointerPosition,
  buildChapterXPointer,
  crengineView,
  resolveChapterXPointer,
} from "../index.ts"
import { addressibleChildren } from "../nodes.ts"
import { parseXPointerSteps } from "../parseXPointerSteps.ts"
import type { XPointerStep } from "../steps.ts"

import {
  type DumpedNode,
  type OracleDocument,
  crengineChildren,
  documents,
} from "./oracleData.ts"
import { parseDoc } from "./support.ts"

/**
 * Do crengine's pointers land on the right node of a document crengine never parsed?
 *
 * Each fixture is packaged as a chapter of a real EPUB, so the xpointers in
 * `oracle/crengine.json` are what a device writes: rooted at the merged document, naming the
 * chapter's `DocFragment`, counting crengine's rendered tree — the one where whitespace-only
 * text at an inline-run edge has been deleted and text has been rewritten while parsing. Here
 * the very bytes crengine parsed are parsed again with @xmldom/xmldom and resolved through a
 * view built from the fixture's own stylesheets and page width.
 *
 * A pointer that lands on the wrong node fails with both candidates described, because "the
 * cascade said a different element is a block" and "the parser disagreed" look identical from
 * an index alone.
 */

/** The two fixtures whose markup the two parsers cannot agree on, and why. */
const SKIPPED = new Map([
  ["unclosed", "crengine repairs unclosed tags; an XML parser reports them"],
  [
    "tables",
    "crengine re-parents misplaced table content; an XML parser keeps it",
  ],
])

const FIXTURES = new URL(
  "../../../../tools/crengine-oracle/fixtures/",
  import.meta.url,
)

/** The prefix every pointer into the first chapter of the book carries. */
const CHAPTER = "/body[1]/DocFragment[1]/body[1]"

describe("crengine pointer parity", () => {
  for (const document of documents) {
    const skipped = SKIPPED.get(document.fixture)
    const name = `${document.fixture} @${document.screenWidth}px`
    if (skipped !== undefined) {
      it(`skips ${name}: ${skipped}`, () => {
        // Guard the skip list: if a fixture is fixed, its entry has to go too.
        expect(document.source.length).toBeGreaterThan(0)
      })
      continue
    }
    it(`resolves every ${name} pointer in the parsed chapter`, () => {
      const report = checkDocument(document, "resolve")
      expect(report.checked).toBeGreaterThan(10)
      expect(report.failures.slice(0, 6).join("\n")).toBe("")
      expect(report.failures.length).toBe(0)
    })
    it(`builds every ${name} pointer from the parsed chapter`, () => {
      const report = checkDocument(document, "build")
      expect(report.checked).toBeGreaterThan(10)
      expect(report.failures.slice(0, 6).join("\n")).toBe("")
      expect(report.failures.length).toBe(0)
    })
  }
})

type Report = { checked: number; failures: string[] }

/** Which direction of the translation is being checked. */
type Mode = "resolve" | "build"

function checkDocument(document: OracleDocument, mode: Mode): Report {
  const chapter = parseDoc(document.source)
  const view = crengineView({
    styleSheets: sheetsFor(document),
    screenWidth: document.screenWidth,
  })
  const body = bodyOf(chapter)
  if (body === null) {
    return {
      checked: 0,
      failures: ["the chapter has no body element"],
    }
  }

  const byId = new Map<number, DumpedNode>()
  for (const node of flatten(document.tree)) byId.set(node.id, node)
  const chapterDump = chapterBodyOf(document)
  if (chapterDump === null) {
    return {
      checked: 0,
      failures: ["no chapter body in the dump"],
    }
  }

  const failures: string[] = []
  let checked = 0
  for (const pointer of document.pointers) {
    if (
      pointer.xpointer !== CHAPTER &&
      !pointer.xpointer.startsWith(`${CHAPTER}/`)
    )
      continue
    const target = byId.get(pointer.id)
    if (target === undefined) continue
    const steps = parseXPointerSteps(pointer.xpointer)?.slice(3) ?? []
    const walked = walkDump(steps, chapterDump)
    if (walked === null || walked.node !== target) {
      // The dump and the pointer string disagree, which is a broken fixture, not a bug here.
      failures.push(
        `${pointer.xpointer}: does not name id ${pointer.id} in crengine's own tree`,
      )
      continue
    }
    checked++

    const expected = descend(body, walked.indexes, view)
    if (expected === null) {
      failures.push(
        `${pointer.xpointer}: this tree has no node at ${walked.indexes.join("/")}`,
      )
      continue
    }

    if (mode === "build") {
      const offset = sourceOffsetOf(pointer.offset, expected, view)
      const built = buildChapterXPointer(
        chapter,
        { node: expected, offset },
        { spineIndex: 0, view },
      )
      if (built !== pointer.xpointer)
        failures.push(`${pointer.xpointer}: built ${built}`)
      continue
    }

    const position = resolveChapterXPointer(chapter, pointer.xpointer, {
      spineIndex: 0,
      view,
    })
    if (position === null) {
      failures.push(
        `${pointer.xpointer} -> nothing; crengine meant ${describeDumped(target)}`,
      )
      continue
    }
    if (position.node !== expected) {
      failures.push(
        `${pointer.xpointer} -> ${describeNode(position.node)}, crengine meant ${describeDumped(target)} at ${walked.indexes.join("/")}`,
      )
      continue
    }
    const problem = checkCaret(
      pointer.xpointer,
      pointer.offset,
      target,
      position,
      view,
    )
    if (problem !== null) failures.push(problem)
  }
  return { checked, failures }
}

/**
 * The caret, converted into the caller's coordinates and back.
 *
 * A text caret counts the text crengine stored, so the stored text itself has to agree — that
 * is the parse-time rewrite being right — and only then does the round trip mean anything.
 */
function checkCaret(
  xpointer: string,
  offset: number,
  target: DumpedNode,
  position: XPointerPosition,
  view: ReturnType<typeof crengineView>,
): string | null {
  if (offset < 0) return null
  if (target.kind === "text") {
    const node = position.node as Text
    const stored = view.textOf(node)
    if (stored.text !== (target.text ?? "")) {
      return `${xpointer}: this text is ${JSON.stringify(stored.text)}, crengine stored ${JSON.stringify(target.text)}`
    }
    if (view.toCreOffset(node, position.offset) !== offset) {
      return `${xpointer}: caret ${offset} survives the trip through this text as ${String(view.toCreOffset(node, position.offset))}`
    }
    return null
  }
  const projected = view.children(position.node)
  if (offset > projected.length) {
    return `${xpointer}: caret ${offset} is past crengine's ${projected.length} children`
  }
  if (offset === projected.length) {
    const raw = [...addressibleChildren(position.node)].length
    return position.offset === raw
      ? null
      : `${xpointer}: caret ${offset} means "past the last child", got index ${position.offset} of ${raw}`
  }
  const crengineChild = projected[offset]
  return crengineChild ===
    [...addressibleChildren(position.node)][position.offset]
    ? null
    : `${xpointer}: caret ${offset} means child ${describeNode(crengineChild ?? null)}, got ${describeNode([...addressibleChildren(position.node)][position.offset] ?? null)}`
}

/**
 * The position whose pointer crengine wrote, in this tree's coordinates.
 *
 * The inverse of what the resolver returns: a text caret counts crengine's stored text and an
 * element caret counts crengine's children, so both have to be translated before building.
 */
function sourceOffsetOf(
  offset: number,
  node: Node,
  view: ReturnType<typeof crengineView>,
): number {
  if (offset < 0) return -1
  if (node.nodeType === 3) return view.toSourceOffset(node as Text, offset)
  const projected = view.children(node)
  const raw = [...addressibleChildren(node)]
  if (offset >= projected.length) return raw.length
  return raw.indexOf(projected[offset] as Node)
}

/**
 * The sheets crengine had for this chapter: the linked stylesheet, and nothing else.
 *
 * A `<style>` inside the chapter is deliberately not passed. crengine ignores one that sits in
 * the chapter body — `internal.xhtml` measures `<em>` still inline and `<strong>` still
 * collapsing after `em { display: block }` and `strong { white-space: pre }` — so handing it
 * over as author CSS would model an effect the device never has.
 */
function sheetsFor(
  document: OracleDocument,
): { css: string; kind: "author" }[] {
  try {
    const path = fileURLToPath(new URL(`${document.fixture}.css`, FIXTURES))
    return [{ css: readFileSync(path, "utf8"), kind: "author" }]
  } catch {
    // Most fixtures have no stylesheet of their own.
    return []
  }
}

/** The `<body>` of the parsed chapter. */
function bodyOf(chapter: Node): Node | null {
  const root = chapter.ownerDocument?.documentElement ?? chapter
  for (let child = root.firstChild; child !== null; child = child.nextSibling) {
    if (
      child.nodeType === 1 &&
      (child.nodeName === "body" || child.localName === "body")
    ) {
      return child
    }
  }
  return null
}

/** The `<body>` inside the first chapter's `DocFragment`, in crengine's dump. */
function chapterBodyOf(document: OracleDocument): DumpedNode | null {
  const outerBody = document.tree.find((node) => node.name === "body")
  if (outerBody === undefined) return null
  const fragment = crengineChildren(outerBody).find(
    (node) => node.name === "DocFragment",
  )
  if (fragment === undefined) return null
  return crengineChildren(fragment).find((node) => node.name === "body") ?? null
}

/**
 * Follow a pointer through crengine's own tree, recording where each step lands among the
 * children of its parent.
 *
 * The recorded indexes are the positions an xpointer counts — crengine's tree, boxing made
 * transparent — and applying the same indexes to the parsed tree through the view is the claim
 * under test. Walking the dump rather than reusing the resolver keeps the two sides
 * independent: a resolver bug cannot agree with itself.
 */
function walkDump(
  steps: readonly XPointerStep[],
  from: DumpedNode,
): { node: DumpedNode; indexes: number[] } | null {
  let current = from
  const indexes: number[] = []
  for (const step of steps) {
    if (step.kind === "offset") break
    const children = crengineChildren(current)
    const matching = children.filter((child) => matchesDumped(child, step))
    const found = step.index === -1 ? matching[0] : matching[step.index - 1]
    if (found === undefined) return null
    indexes.push(children.indexOf(found))
    current = found
  }
  return { node: current, indexes }
}

function matchesDumped(child: DumpedNode, step: XPointerStep): boolean {
  if (step.kind === "text") return child.kind === "text"
  if (step.kind === "element")
    return child.kind === "element" && child.name === step.name
  return true
}

/** Follow `path` from `node`, counting children the way the view counts them. */
function descend(
  node: Node,
  path: number[],
  view: ReturnType<typeof crengineView>,
): Node | null {
  let current: Node | null = node
  for (const index of path) {
    if (current === null) return null
    current = view.children(current)[index] ?? null
  }
  return current
}

function* flatten(nodes: DumpedNode[]): Generator<DumpedNode> {
  for (const node of nodes) {
    yield node
    yield* flatten(node.children)
  }
}

function describeNode(node: Node | null): string {
  if (node === null) return "nothing"
  return node.nodeType === 1
    ? `element <${node.nodeName}>`
    : `text ${JSON.stringify(node.nodeValue ?? "")}`
}

function describeDumped(node: DumpedNode): string {
  return node.kind === "element"
    ? `crengine element <${node.name}> (id ${node.id})`
    : `crengine text ${JSON.stringify(node.text ?? "")} (id ${node.id})`
}
