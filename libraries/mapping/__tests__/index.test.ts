import assert from "node:assert"

import { describe, it } from "vitest"

import { Mapping } from "../index.ts"

describe("Mapping.map", () => {
  it("should map insertions forward", () => {
    // a b c d e
    // aaa bbbb ccc dddd eee
    const mapping = new Mapping()
    mapping.insertMap(0, 1, 3)
    mapping.insertMap(2, 1, 4)
    mapping.insertMap(4, 1, 3)
    mapping.insertMap(6, 1, 4)
    mapping.insertMap(8, 1, 3)

    const cursor = mapping.cursor()

    assert.strictEqual(cursor.map(0), 0)
    assert.strictEqual(cursor.map(1), 3)
    assert.strictEqual(cursor.map(2), 4)
    assert.strictEqual(cursor.map(3), 8)
    assert.strictEqual(cursor.map(4), 9)
    assert.strictEqual(cursor.map(5), 12)
  })

  it("handle out-of-order insertions", () => {
    // a b c d e
    // aaa bbbb ccc dddd eee
    const mapping = new Mapping()
    mapping.insertMap(0, 1, 3)
    mapping.insertMap(4, 1, 3)
    mapping.insertMap(2, 1, 4)
    mapping.insertMap(8, 1, 3)
    mapping.insertMap(6, 1, 4)

    const cursor = mapping.cursor()

    assert.strictEqual(cursor.map(0), 0)
    assert.strictEqual(cursor.map(1), 3)
    assert.strictEqual(cursor.map(2), 4)
    assert.strictEqual(cursor.map(3), 8)
    assert.strictEqual(cursor.map(4), 9)
    assert.strictEqual(cursor.map(5), 12)
  })

  it("handle mutations on the same position", () => {
    const mapping = new Mapping()

    mapping.insertMap(2, 6, 3)

    let cursor = mapping.cursor()

    assert.strictEqual(cursor.map(8), 5)

    // Completely undo initial mutation
    mapping.insertMap(2, 3, 6)
    cursor = mapping.cursor()
    assert.strictEqual(cursor.map(8), 8)

    mapping.insertMap(2, 3, 6)
    cursor = mapping.cursor()
    assert.strictEqual(cursor.map(8), 11)

    // Expand the initial mutation
    mapping.insertMap(2, 6, 8)
    cursor = mapping.cursor()
    assert.strictEqual(cursor.map(8), 13)

    // Collapse the previous mutation
    mapping.insertMap(2, 8, 4)
    cursor = mapping.cursor()
    assert.strictEqual(cursor.map(8), 9)
  })

  it("should map deletions forward", () => {
    // |a||b||c||d|
    // a b c d
    const mapping = new Mapping()
    mapping.insertMap(0, 1, 0)
    mapping.insertMap(2, 2, 1)
    mapping.insertMap(5, 2, 1)
    mapping.insertMap(8, 2, 1)
    mapping.insertMap(11, 1, 0)

    const cursor = mapping.cursor()

    assert.strictEqual(cursor.map(0), 0)
    assert.strictEqual(cursor.map(1), 0)
    assert.strictEqual(cursor.map(2), 1)
    assert.strictEqual(cursor.map(3), 1)
    assert.strictEqual(cursor.map(4), 2)
    assert.strictEqual(cursor.map(5), 3)
    assert.strictEqual(cursor.map(6), 3)
    assert.strictEqual(cursor.map(7), 4)
    assert.strictEqual(cursor.map(8), 5)
    assert.strictEqual(cursor.map(9), 5)
    assert.strictEqual(cursor.map(10), 6)
    assert.strictEqual(cursor.map(11), 7)
  })

  it("should map insertions backward", () => {
    // aaa bbbb ccc dddd eee
    // a b c d e
    const mapping = new Mapping()
    mapping.insertMap(0, 1, 3)
    mapping.insertMap(2, 1, 4)
    mapping.insertMap(4, 1, 3)
    mapping.insertMap(6, 1, 4)
    mapping.insertMap(8, 1, 3)

    const inverted = mapping.invert()
    const cursor = inverted.cursor()

    assert.strictEqual(cursor.map(0), 0)
    assert.strictEqual(cursor.map(3), 1)
    assert.strictEqual(cursor.map(4), 2)
    assert.strictEqual(cursor.map(8), 3)
    assert.strictEqual(cursor.map(9), 4)
    assert.strictEqual(cursor.map(12), 5)
  })

  it("should map deletions backward", () => {
    // a b c d
    // |a||b||c||d|
    const mapping = new Mapping()
    mapping.insertMap(0, 1, 0)
    mapping.insertMap(2, 2, 1)
    mapping.insertMap(5, 2, 1)
    mapping.insertMap(8, 2, 1)
    mapping.insertMap(11, 1, 0)

    const inverted = mapping.invert()
    const cursor = inverted.cursor()

    assert.strictEqual(cursor.map(0), 0)
    assert.strictEqual(cursor.map(0, "end"), 1)
    assert.strictEqual(cursor.map(1), 2)
    assert.strictEqual(cursor.map(2), 4)
    assert.strictEqual(cursor.map(3), 5)
    assert.strictEqual(cursor.map(4), 7)
    assert.strictEqual(cursor.map(5), 8)
    assert.strictEqual(cursor.map(6), 10)
  })
})

describe("Mapping.appendMapping", () => {
  it("composes a grow stage with a shrink stage", () => {
    // a—b   ('—' at 1)
    // a-b
    const mapping = new Mapping()
    mapping.insertMap(1, 1, 2) // stage 1: '—' expands to '--'  -> "a--b"
    const slugified = new Mapping()
    slugified.insertMap(1, 2, 1) // stage 2 (in stage-1 output coords): '--' collapses to '-'
    mapping.appendMapping(slugified)

    const cursor = mapping.cursor()
    assert.strictEqual(cursor.map(0), 0) // 'a'
    assert.strictEqual(cursor.map(2), 2) // 'b'
  })

  it("composes multiple stages that shift later content", () => {
    // a1b2c   ('1' at 1, '2' at 3)
    // aXbYYc
    const mapping = new Mapping()
    mapping.insertMap(1, 1, 2) // '1' -> 2 chars
    mapping.insertMap(3, 1, 2) // '2' -> 2 chars   -> "aXXbYYc"
    const second = new Mapping()
    second.insertMap(1, 2, 1) // stage 2: first expanded region 'XX' -> 'X'
    mapping.appendMapping(second)

    const cursor = mapping.cursor()
    assert.strictEqual(cursor.map(0), 0) // 'a'
    assert.strictEqual(cursor.map(2), 2) // 'b'
    assert.strictEqual(cursor.map(4), 5) // 'c'
  })

  it("appends onto an empty mapping", () => {
    // ab_c   (2-char span at 1 collapses to 1)
    // aXc
    const mapping = new Mapping()
    const second = new Mapping()
    second.insertMap(1, 2, 1)
    mapping.appendMapping(second)

    const cursor = mapping.cursor()
    assert.strictEqual(cursor.map(0), 0)
    assert.strictEqual(cursor.map(3), 2) // content after the shrink shifts left by 1
  })

  it("coalesces a later stage that collapses across an earlier deletion", () => {
    // Models slugify: `a-- "b`
    //   --stage 2 (` "` -> `-`)-->  `a---b`
    //   --stage 3 (collapse `---` -> `-`)-->  `a-b`
    // 'a'@0, '-'@1, '-'@2, ' '@3, '"'@4, 'b'@5
    const mapping = new Mapping()
    mapping.insertMap(3, 2, 1) // stage 2: ` "` (orig 3..5) -> `-`
    const collapse = new Mapping()
    collapse.insertMap(1, 3, 1) // stage 3 (in stage-2 output coords): `---` (1..4) -> `-`
    mapping.appendMapping(collapse)

    const cursor = mapping.cursor()
    // The composed mapping must stay monotonic: orig `a-- "b` -> `a-b`
    assert.strictEqual(cursor.map(0), 0) // 'a'
    assert.strictEqual(cursor.map(5), 2) // 'b'
    // monotonic across the collapsed region (regression: used to jump backward)
    let prev = -1
    for (let p = 0; p <= 5; p++) {
      const m = cursor.map(p)
      assert.ok(m >= prev, `map(${p})=${m} decreased from ${prev}`)
      prev = m
    }
  })

  it("keeps a coalesced entry's span when it collapses to a no-op", () => {
    // Stage 1 expands four single characters. Stage 2 then deletes a span that
    // ends inside the last expansion, a character further inside that same
    // expansion, and finally a long span that starts inside it. Coalescing the
    // first deletion with the expansion it straddles collapses that entry to a
    // no-op — but dropping it also drops its span, so the next deletion merges
    // with an entry three characters too narrow while still carrying the full
    // delta, and its size goes negative.
    const mapping = new Mapping()
    mapping.insertMap(61, 1, 2)
    mapping.insertMap(62, 1, 3)
    mapping.insertMap(66, 1, 3)
    mapping.insertMap(70, 1, 5)

    const deletions = new Mapping()
    deletions.insertMap(72, 4, 0)
    deletions.insertMap(77, 1, 0)
    deletions.insertMap(79, 9, 0)

    mapping.appendMapping(deletions)

    // 80 characters in, 15 inserted by stage 1, 14 deleted by stage 2.
    const cursor = mapping.cursor()
    assert.strictEqual(cursor.map(0), 0)
    assert.strictEqual(cursor.map(61), 61)
    assert.strictEqual(cursor.map(80), 75)

    let prev = -1
    for (let p = 0; p <= 80; p++) {
      const m = cursor.map(p)
      assert.ok(m >= prev, `map(${p})=${m} decreased from ${prev}`)
      prev = m
    }
  })

  it("distributes positions inside a grown region instead of collapsing", () => {
    // A 4-character word expands to 12 characters (e.g. Chinese -> pinyin).
    // Positions inside the word must map to distinct, increasing offsets so a
    // per-character timeline is not collapsed onto the word boundary.
    const mapping = new Mapping()
    mapping.insertMap(2, 4, 12)

    const cursor = mapping.cursor()
    let prev = -1
    for (let p = 2; p <= 6; p++) {
      const m = cursor.map(p)
      assert.ok(m > prev, `map(${p})=${m} did not increase past ${prev}`)
      prev = m
    }
  })
})
