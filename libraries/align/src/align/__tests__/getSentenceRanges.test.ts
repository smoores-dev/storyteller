import assert from "node:assert"

import { describe, it } from "vitest"

import {
  SentenceRange,
  enforceMonotonicAudioRanges,
} from "../getSentenceRanges.ts"

const files = ["a.mp3", "b.mp3", "c.mp3"]
const durations = { "a.mp3": 1761, "b.mp3": 3600, "c.mp3": 3600 }

function sr(
  id: number,
  ...clips: [audiofile: string, start: number, end: number][]
) {
  return new SentenceRange(
    id,
    "ch",
    clips.map(([audiofile, start, end]) => ({ audiofile, start, end })),
  )
}

describe("enforceMonotonicAudioRanges", () => {
  it("leaves an already monotonic sequence unchanged", () => {
    const input = [
      sr(0, ["a.mp3", 0, 5]),
      sr(1, ["a.mp3", 5, 9], ["b.mp3", 0, 2]),
      sr(2, ["b.mp3", 2, 4]),
    ]
    assert.deepStrictEqual(
      enforceMonotonicAudioRanges(input, files, durations),
      input,
    )
  })

  it("drops clips in an earlier file than the previous sentence's end and trims the overlap", () => {
    // Chapter 7's straddling last sentence vs chapter 8's heading parked
    // 1.5 s before file a ends
    const input = [
      sr(0, ["a.mp3", 1760.3, 1761], ["b.mp3", 0, 1.24]),
      sr(1, ["a.mp3", 1759, 1761], ["b.mp3", 0, 5.58]),
      sr(2, ["b.mp3", 5.58, 8.3]),
    ]
    assert.deepStrictEqual(
      enforceMonotonicAudioRanges(input, files, durations),
      [
        sr(0, ["a.mp3", 1760.3, 1761], ["b.mp3", 0, 1.24]),
        sr(1, ["b.mp3", 1.24, 5.58]),
        sr(2, ["b.mp3", 5.58, 8.3]),
      ],
    )
  })

  it("gives a sentence just behind the previous one a zero-length clip", () => {
    const input = [sr(0, ["b.mp3", 10, 20]), sr(1, ["b.mp3", 5, 15])]
    assert.deepStrictEqual(
      enforceMonotonicAudioRanges(input, files, durations),
      [sr(0, ["b.mp3", 10, 20]), sr(1, ["b.mp3", 20, 20])],
    )
  })

  it("trims a same-file overlap to start at the previous end", () => {
    const input = [sr(0, ["a.mp3", 0, 10]), sr(1, ["a.mp3", 8, 12])]
    assert.deepStrictEqual(
      enforceMonotonicAudioRanges(input, files, durations),
      [sr(0, ["a.mp3", 0, 10]), sr(1, ["a.mp3", 10, 12])],
    )
  })

  it("keeps a block the audiobook narrates out of text order", () => {
    // The Plague: Part V's last sections are in file a, before its first
    // sections in file b
    const input = [
      sr(0, ["b.mp3", 0, 10]),
      sr(1, ["b.mp3", 10, 20]),
      sr(2, ["a.mp3", 600, 610]),
      sr(3, ["a.mp3", 610, 620]),
    ]
    assert.deepStrictEqual(
      enforceMonotonicAudioRanges(input, files, durations),
      input,
    )
  })

  it("still trims a small overlap right after an out-of-order block", () => {
    const input = [
      sr(0, ["b.mp3", 0, 10]),
      sr(1, ["a.mp3", 600, 610]),
      sr(2, ["a.mp3", 608, 615]),
    ]
    assert.deepStrictEqual(
      enforceMonotonicAudioRanges(input, files, durations),
      [
        sr(0, ["b.mp3", 0, 10]),
        sr(1, ["a.mp3", 600, 610]),
        sr(2, ["a.mp3", 610, 615]),
      ],
    )
  })
})
