import { readFileSync } from "node:fs"

/**
 * The data `tools/crengine-oracle` produces, shared by the tests that check this library
 * against it.
 *
 * Nothing here is hand-written: `yarn generate` rebuilds it from an unmodified build of the
 * C++, so it is crengine's own answer and not a guess at it.
 */

export type DumpedNode = {
  id: number
  kind: "element" | "text"
  name?: string | undefined
  text?: string | undefined
  boxing?: boolean | undefined
  attrs?: [string, string][] | undefined
  block?: boolean | undefined
  pre?: boolean | undefined
  display?: number | undefined
  whiteSpace?: number | undefined
  children: DumpedNode[]
}

export type DumpedPointer = { id: number; offset: number; xpointer: string }

export type DumpedResolution = {
  xpointer: string
  id: number | null
  offset: number | null
}

export type OracleDocument = {
  fixture: string
  domVersion: number
  stylesEnabled: boolean
  docFlags: number
  screenWidth: number
  uaCssBytes: number
  uaCssSha256?: string | undefined
  /** The chapter bytes crengine was given, so a test can parse exactly what it parsed. */
  source: string
  tree: DumpedNode[]
  pointers: DumpedPointer[]
  resolves: DumpedResolution[]
}

export const documents: OracleDocument[] = JSON.parse(
  readFileSync(new URL("./oracle/crengine.json", import.meta.url), "utf8"),
) as OracleDocument[]

/** Every dumped node under `dumped`, in document order. */
export function collect(
  dumped: DumpedNode[],
  found: DumpedNode[] = [],
): DumpedNode[] {
  for (const node of dumped) {
    found.push(node)
    collect(node.children, found)
  }
  return found
}

/**
 * The children of a dumped node, with boxing made transparent.
 *
 * crengine inserts `autoBoxing` and friends while laying out, and `toStringV2()` never names
 * them, so they are not part of the shape an xpointer counts.
 */
export function crengineChildren(node: DumpedNode): DumpedNode[] {
  const out: DumpedNode[] = []
  for (const child of node.children) {
    if (child.boxing === true) out.push(...crengineChildren(child))
    else out.push(child)
  }
  return out
}
