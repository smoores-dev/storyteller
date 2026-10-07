import { describe, expect, it } from "vitest"

import {
  type Element,
  type Node,
  buildXPointer,
  resolveXPointer,
} from "../index.ts"

import {
  type DumpedNode,
  type OracleDocument,
  collect,
  documents,
} from "./oracleData.ts"
import { parseDoc } from "./support.ts"

/**
 * These expectations are not hand-written.
 *
 * They are crengine's own answers, dumped by `tools/crengine-oracle` from an unmodified build
 * of the C++, which parses each fixture with crengine's real parser and then reports the
 * xpointer of every node and what crengine makes of every string. See that directory's README
 * for how to regenerate them.
 *
 * The tree is rebuilt here from the dump rather than re-parsing the fixture with @xmldom/xmldom,
 * so that a difference between two HTML parsers can never be mistaken for a difference between
 * two xpointer algorithms.
 */

/**
 * Recreate one dumped crengine tree in @xmldom/xmldom.
 *
 * crengine's root node is a parentless element that xpointers never name, so it becomes a
 * plain element here too, and is what the library is told to treat as the root.
 *
 * Boxing nodes (`autoBoxing`, and the pseudo-element boxes) are dropped and their children
 * promoted to the parent: crengine inserts them while laying out, `toStringV2()` never names
 * them, and a tree that was only parsed — which is what the library is given — has no such
 * nodes. The rebuilt tree is therefore crengine's tree with boxing made transparent, which is
 * the shape the library has to reproduce from strings alone.
 */
function rebuild(document: OracleDocument): {
  root: Element
  byId: Map<number, Node>
  idOf: Map<Node, number>
} {
  const dom = parseDoc("<crengine-root/>")
  const root = dom.documentElement!
  const byId = new Map<number, Node>([[1, root]])
  const idOf = new Map<Node, number>([[root, 1]])
  const addAttributes = (
    element: Element,
    attributes: [string, string][],
  ): Element => {
    // crengine may have rewritten an attribute while building the tree — EPUB ids gain a
    // `_doc_fragment_N` prefix, for one — so what it stored is what has to be matched against.
    for (const [name, value] of attributes) element.setAttribute(name, value)
    return element
  }
  const add = (dumped: DumpedNode, parent: Node): void => {
    if (dumped.boxing === true) {
      for (const child of dumped.children) add(child, parent)
      return
    }
    const node: Node =
      dumped.kind === "element"
        ? addAttributes(
            dom.createElement(dumped.name ?? ""),
            dumped.attrs ?? [],
          )
        : dom.createTextNode(dumped.text ?? "")
    byId.set(dumped.id, node)
    idOf.set(node, dumped.id)
    parent.appendChild(node)
    for (const child of dumped.children) add(child, node)
  }
  for (const top of document.tree) add(top, root)
  return { root, byId, idOf }
}

describe("crengine oracle", () => {
  it("has data at all", () => {
    expect(documents.length).toBeGreaterThan(0)
  })

  it("covers crengine's boxing nodes", () => {
    // rebuild() makes boxing nodes transparent, which is only worth something if the data
    // contains them; if this ever drops to zero, the flattening above is untested.
    const boxing = documents
      .flatMap((document) => collect(document.tree))
      .filter((node) => node.boxing === true)
    expect(boxing.length).toBeGreaterThan(0)
  })

  for (const document of documents) {
    const name = `${document.fixture} @${document.screenWidth}px`
    const { root, byId, idOf } = rebuild(document)

    describe(name, () => {
      it("builds the xpointer crengine builds", () => {
        const mismatches = document.pointers.flatMap((pointer) => {
          const actual = buildXPointer(root, {
            node: byId.get(pointer.id)!,
            offset: pointer.offset,
          })
          return actual === pointer.xpointer
            ? []
            : [{ ...pointer, actual, expected: pointer.xpointer }]
        })
        expect(mismatches).toEqual([])
      })

      it("resolves what crengine resolves", () => {
        const mismatches = document.resolves.flatMap((resolution) => {
          const position = resolveXPointer(root, resolution.xpointer)
          const actual =
            position === null
              ? [null, null]
              : [idOf.get(position.node) ?? -1, position.offset]
          const expected: (number | null)[] = [resolution.id, resolution.offset]
          return actual[0] === expected[0] && actual[1] === expected[1]
            ? []
            : [{ xpointer: resolution.xpointer, expected, actual }]
        })
        expect(mismatches).toEqual([])
      })
    })
  }
})
