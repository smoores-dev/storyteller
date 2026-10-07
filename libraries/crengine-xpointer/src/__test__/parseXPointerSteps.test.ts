import { describe, expect, it } from "vitest"

import { parseXPointerSteps } from "../index.ts"

const element = (name: string, index: number) => ({
  kind: "element",
  name,
  index,
})
const text = (index: number) => ({ kind: "text", index })
const child = (index: number) => ({ kind: "child", index })
const offset = (offset: number) => ({ kind: "offset", offset })

describe("parseXPointerSteps", () => {
  it("parses the shape documented for crengine xpointers", () => {
    expect(
      parseXPointerSteps("/body/DocFragment/body/div/p[4]/text()[1].64"),
    ).toEqual([
      element("body", -1),
      element("DocFragment", -1),
      element("body", -1),
      element("div", -1),
      element("p", 4),
      text(1),
      offset(64),
    ])
  })

  it("parses every step kind", () => {
    expect(parseXPointerSteps("/html[1]/body[1]/2/text()[3]/p.7")).toEqual([
      element("html", 1),
      element("body", 1),
      child(2),
      text(3),
      element("p", -1),
      offset(7),
    ])
  })

  it("treats text() as the text step and not as an element named text()", () => {
    expect(parseXPointerSteps("/text()")).toEqual([text(-1)])
    expect(parseXPointerSteps("/text")).toEqual([element("text", -1)])
  })

  it("takes an empty path as no steps, leaving the position at the root", () => {
    // crengine rejects the empty string itself, before parsing; resolveXPointer does the same.
    expect(parseXPointerSteps("")).toEqual([])
  })

  describe("names", () => {
    it("accepts any run of characters other than the delimiters", () => {
      expect(parseXPointerSteps("/dc:title")).toEqual([element("dc:title", -1)])
      expect(parseXPointerSteps("/epub:type")).toEqual([
        element("epub:type", -1),
      ])
      expect(parseXPointerSteps("/p-1_x")).toEqual([element("p-1_x", -1)])
      expect(parseXPointerSteps("/П_Г[2]")).toEqual([element("П_Г", 2)])
      // Only `[`, `/` and `.` end a name, so a stray `]` becomes part of it — and then no
      // element can ever be named that. crengine's tokenizer does the same.
      expect(parseXPointerSteps("/p]q")).toEqual([element("p]q", -1)])
    })

    it("cannot express a name containing a delimiter", () => {
      expect(parseXPointerSteps("/a.b")).toEqual([
        element("a", -1),
        element("b", -1),
      ])
      expect(parseXPointerSteps("/a/b")).toEqual([
        element("a", -1),
        element("b", -1),
      ])
      expect(parseXPointerSteps("/a[b")).toBeNull()
    })

    it("does not treat a leading digit inside a name as an index", () => {
      expect(parseXPointerSteps("/p2")).toEqual([element("p2", -1)])
      // …but a name may not *start* with a digit: that is the `/N` child-index step, and it
      // has to end at a delimiter.
      expect(parseXPointerSteps("/2p")).toBeNull()
    })

    it("keeps `#` an ordinary character", () => {
      // crengine handles `#id` before reaching the path parser, so a relative path may
      // legitimately look for an element named `#foo`.
      expect(parseXPointerSteps("/#foo")).toEqual([element("#foo", -1)])
    })
  })

  describe("indexes", () => {
    it("parses an explicit index", () => {
      expect(parseXPointerSteps("/p[1]")).toEqual([element("p", 1)])
      expect(parseXPointerSteps("/p[12345]")).toEqual([element("p", 12345)])
    })

    it("accepts indexes that can never match", () => {
      // Bracketed indexes are not range-checked, unlike the `/N` form. `/p[0]` parses, and
      // then matches nothing (see resolve.test.ts).
      expect(parseXPointerSteps("/p[0]")).toEqual([element("p", 0)])
      expect(parseXPointerSteps("/p[-2]")).toEqual([element("p", -2)])
    })

    it("reads indexes with crengine's atoi, not with parseInt", () => {
      // lString32::atoi accepts a sign, surrounding spaces and 0x hex, and yields 0 — not a
      // partial value — for trailing garbage or overflow.
      expect(parseXPointerSteps("/p[-1]")).toEqual([element("p", -1)])
      expect(parseXPointerSteps("/p[+3]")).toEqual([element("p", 3)])
      expect(parseXPointerSteps("/p[ 2 ]")).toEqual([element("p", 2)])
      expect(parseXPointerSteps("/p[0x10]")).toEqual([element("p", 16)])
      expect(parseXPointerSteps("/p[2x]")).toEqual([element("p", 0)])
      expect(parseXPointerSteps("/p[]x]")).toBeNull()
      expect(parseXPointerSteps("/p[99999999999]")).toEqual([element("p", 0)])
    })

    it("rejects an empty or unterminated index", () => {
      expect(parseXPointerSteps("/p[]")).toBeNull()
      expect(parseXPointerSteps("/p[1")).toBeNull()
      expect(parseXPointerSteps("/p[/")).toBeNull()
    })

    it("does not require the closing bracket when something else ends the step", () => {
      // The bracket scan stops at `]`, `/` or `.` and crengine then advances unconditionally,
      // so a missing `]` is only an error when nothing follows it at all.
      expect(parseXPointerSteps("/p[2/")).toEqual([element("p", 2)])
      // …but only when the step then ends: advancing past the `/` or `.` that stopped the
      // scan has to land on a delimiter, so `/p[2.3]` leaves `3` dangling and is an error.
      expect(parseXPointerSteps("/p[2.")).toEqual([element("p", 2)])
      expect(parseXPointerSteps("/p[2.3]")).toBeNull()
      expect(parseXPointerSteps("/p[2/x]")).toBeNull()
    })
  })

  describe("child index and caret steps", () => {
    it("rejects a `/N` step below 1", () => {
      expect(parseXPointerSteps("/0")).toBeNull()
      expect(parseXPointerSteps("/1/p[2]")).toEqual([child(1), element("p", 2)])
      // A `-` is not a digit, so these are element steps named `-1` rather than indexes —
      // which is also what crengine makes of them.
      expect(parseXPointerSteps("/-1")).toEqual([element("-1", -1)])
      expect(parseXPointerSteps(".-1")).toEqual([element("-1", -1)])
    })

    it("accepts a caret of 0 and rejects a negative one", () => {
      expect(parseXPointerSteps(".0")).toEqual([offset(0)])
      expect(parseXPointerSteps("/p.0")).toEqual([element("p", -1), offset(0)])
    })

    it("requires a caret to be the last step", () => {
      expect(parseXPointerSteps("/p[1].2")).toEqual([
        element("p", 1),
        offset(2),
      ])
      expect(parseXPointerSteps(".2/p[1]")).toBeNull()
      expect(parseXPointerSteps("/p.2/text()[1]")).toBeNull()
    })
  })

  describe("malformed paths", () => {
    it.each([
      ["a step without a prefix", "p[1]"],
      ["a bare slash", "/"],
      ["a bare dot", "."],
      ["a doubled separator", "//"],
      ["a trailing separator", "/p/"],
      ["a missing name", "/[2]"],
      ["a missing name after another step", "/p//q"],
      ["a dot where a name is required", "/./p"],
      ["an unexpected character after a name", "/p/q]x["],
    ])("rejects %s: %s", (_name, path) => {
      expect(parseXPointerSteps(path)).toBeNull()
    })
  })
})
