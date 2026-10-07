import { describe, expect, it } from "vitest"

import {
  type Node,
  type XPointerOptions,
  XPointerError,
  buildXPointer,
  resolveXPointer,
} from "../index.ts"

import { addressibleNodes, parseDoc } from "./support.ts"

const source =
  "<body><div><p>one</p><p>two<b>bold</b>tail</p><section/></div><div><span>x</span></div></body>"

const doc = parseDoc(source)

/** A position addressed by xpointer, so the expectations below read as positions. */
function at(xpointer: string, offset = -1) {
  const position = resolveXPointer(doc, xpointer)
  if (position === null)
    throw new Error(`test fixture error: ${xpointer} resolves to nothing`)
  return { node: position.node, offset }
}

describe("buildXPointer", () => {
  it("names every step and indexes from 1", () => {
    expect(buildXPointer(doc, at("/body/div/p"))).toBe("/body[1]/div[1]/p[1]")
    expect(buildXPointer(doc, at("/body/div[2]/span"))).toBe(
      "/body[1]/div[2]/span[1]",
    )
    expect(buildXPointer(doc, at("/body/div/section"))).toBe(
      "/body[1]/div[1]/section[1]",
    )
  })

  it("appends the caret when there is one", () => {
    expect(buildXPointer(doc, at("/body/div/p[2]", 0))).toBe(
      "/body[1]/div[1]/p[2].0",
    )
    expect(buildXPointer(doc, at("/body/div/p[2]/text()[1]", 2))).toBe(
      "/body[1]/div[1]/p[2]/text()[1].2",
    )
    // Any negative offset means "this is a path", not "a caret at -1".
    expect(buildXPointer(doc, at("/body/div/p[2]", -1))).toBe(
      "/body[1]/div[1]/p[2]",
    )
  })

  it("counts text siblings with text()", () => {
    const threeText = parseDoc("<body><p>a<b>b</b>c<i>d</i>e</p></body>")
    const nth = (index: number) =>
      resolveXPointer(threeText, `/body/p/text()[${index}]`)!
    for (const [index, expected] of [
      [1, "/body[1]/p[1]/text()[1]"],
      [2, "/body[1]/p[1]/text()[2]"],
      [3, "/body[1]/p[1]/text()[3]"],
    ] as const) {
      expect(
        buildXPointer(threeText, { node: nth(index).node, offset: -1 }),
      ).toBe(expected)
    }
  })

  describe("explicitFirstIndex: false, the form crengine wrote before 20260812", () => {
    const options: XPointerOptions = { explicitFirstIndex: false }

    it("leaves [1] out when nothing of that kind follows", () => {
      expect(buildXPointer(doc, at("/body"), options)).toBe("/body")
      expect(buildXPointer(doc, at("/body/div[2]"), options)).toBe(
        "/body/div[2]",
      )
      expect(buildXPointer(doc, at("/body/div[2]/span"), options)).toBe(
        "/body/div[2]/span",
      )
      expect(
        buildXPointer(doc, at("/body/div[1]/p[1]/text()[1]"), options),
      ).toBe("/body/div[1]/p[1]/text()")
    })

    it("still writes [1] when a sibling of the same kind follows", () => {
      // The <div> here is first of two, and the <p> first of two: neither can be written bare,
      // or it would be ambiguous. That lookahead is the cost DOM version 20260812 removed.
      expect(buildXPointer(doc, at("/body/div/p"), options)).toBe(
        "/body/div[1]/p[1]",
      )
      expect(buildXPointer(doc, at("/body/div/section"), options)).toBe(
        "/body/div[1]/section",
      )
      expect(buildXPointer(doc, at("/body/div/p[2]"), options)).toBe(
        "/body/div[1]/p[2]",
      )
      // "two" is followed by "tail" inside the same <p>, so it needs its index too.
      expect(buildXPointer(doc, at("/body/div/p[2]/text()[1]"), options)).toBe(
        "/body/div[1]/p[2]/text()[1]",
      )
    })

    it("still writes [2] and beyond, which were never elided", () => {
      expect(buildXPointer(doc, at("/body/div[2]/span"), options)).toBe(
        "/body/div[2]/span",
      )
      expect(buildXPointer(doc, at("/body/div/p[2]"), options)).toBe(
        "/body/div[1]/p[2]",
      )
    })
  })

  it("returns an empty string for a position at the root", () => {
    // crengine stops at the root without naming it. The empty path is what it produces, and
    // — as in crengine — it does not resolve back.
    expect(buildXPointer(doc, { node: doc, offset: -1 })).toBe("")
    expect(buildXPointer(doc, { node: doc, offset: 0 })).toBe(".0")
  })

  it("refuses a node the root does not contain", () => {
    const elsewhere = parseDoc("<body><p>elsewhere</p></body>")
    const inside = resolveXPointer(doc, "/body/div/p")!
    expect(() => buildXPointer(elsewhere, inside)).toThrow(XPointerError)
    expect(() => buildXPointer(elsewhere.documentElement!, inside)).toThrow(
      XPointerError,
    )
  })

  it("refuses a node crengine could not address", () => {
    const withComment = parseDoc("<body><!--c--><p>a</p></body>")
    const comment = withComment.documentElement!.firstChild as Node
    expect(comment.nodeType).toBe(8)
    // crengine writes an unresolvable `text()[0]` here; that is a bug worth not reproducing.
    expect(() =>
      buildXPointer(withComment, { node: comment, offset: -1 }),
    ).toThrow(XPointerError)
  })

  it("builds a string that resolves back to the same node and offset", () => {
    for (const node of addressibleNodes(doc)) {
      // A caret may sit anywhere in a text node, or between any two children of an element.
      const limit =
        node.nodeType === 1 ? childCount(node) : (node.textContent?.length ?? 0)
      for (const offset of [-1, 0, 1]) {
        if (offset > limit) continue
        const built = buildXPointer(doc, { node, offset })
        expect(built, `no path for ${node.nodeName} at ${offset}`).not.toBe("")
        const resolved = resolveXPointer(doc, built)
        expect(resolved?.node, built).toBe(node)
        expect(resolved?.offset, built).toBe(offset)
      }
    }
  })
})

function childCount(node: Node): number {
  let count = 0
  for (let child = node.firstChild; child !== null; child = child.nextSibling)
    count++
  return count
}
