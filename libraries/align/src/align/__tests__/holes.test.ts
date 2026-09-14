import assert from "node:assert"
import { describe, it } from "node:test"

import { type RangeState, SentenceRange } from "../getSentenceRanges.ts"
import {
  LEGACY_RANGE_BEHAVIOUR,
  collapseRanges,
  planAudioChapters,
} from "../holes.ts"

function sr(
  chapterId: string,
  id: number,
  start: number,
  end: number,
  audiofile = "a.mp3",
  state: RangeState = "matched",
): SentenceRange {
  return new SentenceRange(id, chapterId, [{ start, end, audiofile }], state)
}

const behaviour = { gapSeconds: 2, audioChapterSeconds: 30, dropUnread: true }

void describe("collapseRanges", () => {
  void it("keeps legacy behaviour when gaps are disabled", () => {
    const { ranges, holes } = collapseRanges(
      [sr("c1", 0, 5, 10), sr("c1", 1, 40, 45)],
      ["a.mp3"],
      { "a.mp3": 60 },
      LEGACY_RANGE_BEHAVIOUR,
    )
    assert.deepStrictEqual(
      ranges.map((r) => [r.first.start, r.last.end]),
      [
        [0, 40],
        [40, 60],
      ],
    )
    assert.deepStrictEqual(holes, [])
  })

  void it("bridges small gaps and turns large ones into holes", () => {
    const { ranges, holes } = collapseRanges(
      [sr("c1", 0, 5, 10), sr("c1", 1, 11, 15), sr("c1", 2, 40, 45)],
      ["a.mp3"],
      { "a.mp3": 46 },
      behaviour,
    )
    assert.deepStrictEqual(
      ranges.map((r) => [r.first.start, r.last.end]),
      [
        [5, 11],
        [11, 15],
        [40, 46],
      ],
    )
    assert.deepStrictEqual(
      holes.map((h) => [
        h.start,
        h.end,
        h.anchor.sentenceId,
        h.anchor.position,
        h.boundary,
      ]),
      [
        [0, 5, 0, "before", true],
        [15, 40, 1, "after", false],
      ],
    )
  })

  void it("marks holes between chapters and at track edges as boundaries", () => {
    const { holes } = collapseRanges(
      [sr("c1", 0, 0, 10), sr("c2", 0, 50, 60, "b.mp3")],
      ["a.mp3", "b.mp3"],
      { "a.mp3": 100, "b.mp3": 60 },
      behaviour,
    )
    assert.deepStrictEqual(
      holes.map((h) => [
        h.audiofile,
        h.start,
        h.end,
        h.anchor.chapterId,
        h.anchor.position,
        h.boundary,
      ]),
      [
        ["a.mp3", 10, 100, "c1", "after", true],
        ["b.mp3", 0, 50, "c2", "before", true],
      ],
    )
  })

  void it("gives unreferenced tracks a hole anchored to the previous chapter", () => {
    const { holes } = collapseRanges(
      [sr("c1", 0, 0, 10), sr("c2", 0, 0, 10, "c.mp3")],
      ["a.mp3", "b.mp3", "c.mp3"],
      { "a.mp3": 10, "b.mp3": 90, "c.mp3": 10 },
      behaviour,
    )
    assert.deepStrictEqual(
      holes.map((h) => [
        h.audiofile,
        h.start,
        h.end,
        h.anchor.chapterId,
        h.anchor.position,
      ]),
      [["b.mp3", 0, 90, "c1", "after"]],
    )
  })

  void it("pins dropped sentences to a millisecond before the next sentence", () => {
    const { ranges } = collapseRanges(
      [
        sr("c1", 0, 0, 10),
        sr("c1", 1, 10, 12, "a.mp3", "dropped"),
        sr("c1", 2, 12, 20),
      ],
      ["a.mp3"],
      { "a.mp3": 20 },
      behaviour,
    )
    assert.deepStrictEqual(
      ranges.map((r) => [
        r.id,
        Math.round(r.first.start * 1000),
        Math.round(r.last.end * 1000),
      ]),
      [
        [0, 0, 11999],
        [1, 11999, 12000],
        [2, 12000, 20000],
      ],
    )
  })
})

void describe("collapseRanges with dropped sentences", () => {
  void it("keeps a leading hole clear of the dropped cluster", () => {
    const { ranges, holes } = collapseRanges(
      [
        sr("c1", 0, 0, 5, "a.mp3", "dropped"),
        sr("c1", 1, 5, 10, "a.mp3", "dropped"),
        sr("c1", 2, 30, 40),
      ],
      ["a.mp3"],
      { "a.mp3": 40 },
      behaviour,
    )
    assert.deepStrictEqual(
      holes.map((h) => [Math.round(h.start * 1000), Math.round(h.end * 1000)]),
      [[0, 29998]],
    )
    assert.deepStrictEqual(
      ranges.map((r) => [
        Math.round(r.first.start * 1000),
        Math.round(r.last.end * 1000),
      ]),
      [
        [29998, 29999],
        [29999, 30000],
        [30000, 40000],
      ],
    )
  })
})

void describe("planAudioChapters", () => {
  void it("groups adjacent boundary holes into one chapter", () => {
    const { holes } = collapseRanges(
      [sr("c1", 0, 0, 10), sr("c2", 0, 30, 40, "c.mp3")],
      ["a.mp3", "b.mp3", "c.mp3"],
      { "a.mp3": 20, "b.mp3": 90, "c.mp3": 40 },
      behaviour,
    )
    const { chapters, remaining } = planAudioChapters(
      holes,
      behaviour,
      { "a.mp3": 20, "b.mp3": 90, "c.mp3": 40 },
      (file) => (file === "b.mp3" ? "Interview" : null),
    )
    assert.deepStrictEqual(
      chapters.map((c) => [
        c.title,
        c.anchor.chapterId,
        c.anchor.position,
        c.holes.map((h) => h.audiofile),
      ]),
      [["Interview", "c1", "after", ["a.mp3", "b.mp3", "c.mp3"]]],
    )
    assert.deepStrictEqual(remaining, [])
  })

  void it("leaves short boundary holes as pars", () => {
    const { holes } = collapseRanges(
      [sr("c1", 0, 0, 10), sr("c2", 0, 15, 20)],
      ["a.mp3"],
      { "a.mp3": 20 },
      behaviour,
    )
    const { chapters, remaining } = planAudioChapters(
      holes,
      behaviour,
      { "a.mp3": 20 },
      () => null,
    )
    assert.deepStrictEqual(chapters, [])
    assert.strictEqual(remaining.length, 1)
  })
})
