import assert from "node:assert"

import { describe, it } from "vitest"

import {
  type Box,
  type SeriesEntry,
  buildBoxes,
  collapseRun,
  expandRun,
  expandsFully,
  isValidSeriesNumber,
  toSeriesRelations,
} from "@/app/(v3)/v3/_/components/books/seriesBoxes"
import { type UUID } from "@/uuid"

function range(start: number, end: number) {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}

function entry(
  position: number | null,
  title = "",
  createdAt?: string,
): SeriesEntry {
  return {
    bookUuid: crypto.randomUUID() as UUID,
    title,
    ...(createdAt && { createdAt }),
    position,
    featured: false,
  }
}

// One short string per box, e.g. "1", "2 (empty)", "3+ (trailing)", "4–9"
function describeBoxes(boxes: Box[]) {
  return boxes.flatMap((box) => {
    if (box.kind === "unnumbered") return []
    if (box.kind === "collapsed") return [`${box.start}–${box.end}`]
    if (box.trailing) return [`${box.position}+ (trailing)`]
    return [`${box.position}${box.entries.length ? "" : " (empty)"}`]
  })
}

describe("buildBoxes", () => {
  it("collapses long gaps without creating a box for every number", () => {
    const boxes = buildBoxes([entry(1), entry(1e9)], 0, new Set())
    assert.deepStrictEqual(describeBoxes(boxes), [
      "1",
      "2–999999999",
      "1000000000",
    ])
  })

  it("collapses a long gap before a negative number", () => {
    const boxes = buildBoxes([entry(-1e9), entry(1)], 0, new Set())
    assert.deepStrictEqual(describeBoxes(boxes), [
      "-1000000000",
      "-999999999–0",
      "1",
    ])
  })

  it("shows short gaps and reveals long ones a step at a time", () => {
    const entries = [entry(1999), entry(2003)]
    const once = expandRun(new Set(), 1, 1998)
    assert.deepStrictEqual(describeBoxes(buildBoxes(entries, 0, once)), [
      ...range(1, 10).map((n) => `${n} (empty)`),
      "11–1998",
      "1999",
      "2000 (empty)",
      "2001 (empty)",
      "2002 (empty)",
      "2003",
    ])

    const twice = expandRun(once, 11, 1998)
    assert.deepStrictEqual(
      describeBoxes(buildBoxes(entries, 0, twice)).filter((box) =>
        box.includes("–"),
      ),
      ["21–1998"],
    )
  })

  it("shows a short leftover as boxes instead of a collapsed row", () => {
    const boxes = buildBoxes(
      [entry(1), entry(15)],
      0,
      expandRun(new Set(), 2, 14),
    )
    assert.deepStrictEqual(describeBoxes(boxes), [
      "1",
      ...range(2, 14).map((n) => `${n} (empty)`),
      "15",
    ])
  })

  it("expands a short run fully and offers to hide it from its first box", () => {
    const boxes = buildBoxes(
      [entry(1), entry(7)],
      0,
      expandRun(new Set(), 2, 6),
    )
    assert.deepStrictEqual(describeBoxes(boxes), [
      "1",
      "2 (empty)",
      "3 (empty)",
      "4 (empty)",
      "5 (empty)",
      "6 (empty)",
      "7",
    ])
    const first = boxes.find(
      (box) => box.kind === "number" && box.position === 2,
    )
    assert.deepStrictEqual(first?.kind === "number" && first.collapseRun, {
      start: 2,
      end: 6,
    })
  })

  it("keeps numbers revealed before a shift, collapsing around them", () => {
    const boxes = buildBoxes([entry(1), entry(20)], 0, new Set([10]))
    assert.deepStrictEqual(describeBoxes(boxes), [
      "1",
      "2–9",
      "10 (empty)",
      "11–19",
      "20",
    ])
  })

  it("doesn't treat a decimal highest number as trailing", () => {
    const boxes = buildBoxes([entry(1), entry(2), entry(2.5)], 2, new Set())
    assert.deepStrictEqual(describeBoxes(boxes), [
      "1",
      "2",
      "2.5",
      "3+ (trailing)",
      "4+ (trailing)",
    ])
  })

  it("orders books sharing a number oldest added first", () => {
    const boxes = buildBoxes(
      [
        entry(1, "Two (hardcover)", "2021-01-01 00:00:00"),
        entry(1, "two (paperback)", "2020-01-01 00:00:00"),
      ],
      0,
      new Set(),
    )
    const box = boxes.find((b) => b.kind === "number")
    assert.deepStrictEqual(
      box?.entries.map((e) => e.title),
      ["two (paperback)", "Two (hardcover)"],
    )
  })

  it("orders books added together like SQLite's nocase collation", () => {
    const boxes = buildBoxes(
      [
        entry(1, "two (paperback)", "2020-01-01 00:00:00"),
        entry(1, "Two (hardcover)", "2020-01-01 00:00:00"),
      ],
      0,
      new Set(),
    )
    const box = boxes.find((b) => b.kind === "number")
    assert.deepStrictEqual(
      box?.entries.map((e) => e.title),
      ["Two (hardcover)", "two (paperback)"],
    )
  })
})

describe("expandRun", () => {
  it("adds only a step's worth of numbers, however long the run", () => {
    const expanded = expandRun(new Set(), 2, 999_999_999)
    assert.deepStrictEqual([...expanded], range(2, 11))
  })
})

describe("expandsFully", () => {
  it("is true when at most a few boxes would be left after one step", () => {
    assert.ok(expandsFully(2, 14))
    assert.ok(!expandsFully(2, 15))
  })
})

describe("collapseRun", () => {
  it("removes only the numbers inside the run", () => {
    const expanded = collapseRun(new Set([1, 5, 999_999_990, 2e9]), 2, 1e9)
    assert.deepStrictEqual([...expanded], [1, 2e9])
  })
})

describe("isValidSeriesNumber", () => {
  it("accepts decimals and negatives but not huge or non-finite numbers", () => {
    assert.ok(isValidSeriesNumber(2.5))
    assert.ok(isValidSeriesNumber(-3))
    assert.ok(isValidSeriesNumber(20231015))
    assert.ok(!isValidSeriesNumber(1e10))
    assert.ok(!isValidSeriesNumber(Infinity))
    assert.ok(!isValidSeriesNumber(NaN))
  })
})

describe("toSeriesRelations", () => {
  it("drops the display-only title and date added", () => {
    const book = entry(1, "one", "2020-01-01 00:00:00")
    assert.deepStrictEqual(toSeriesRelations([book]), [
      { bookUuid: book.bookUuid, position: 1, featured: false },
    ])
  })
})
