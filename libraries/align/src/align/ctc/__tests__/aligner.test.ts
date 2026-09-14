import assert from "node:assert"
import { describe, it } from "node:test"

import {
  checkAudioEmissionsPairing,
  extendDominantRun,
  findDominantRun,
  narrowToAvailableBoundary,
} from "../Aligner.ts"
import { type TokenAlignment } from "../forcedAlign.ts"

function audiofiles(count: number) {
  return Array.from(
    { length: count },
    (_, i) => `/audiobook/${String(i + 1).padStart(5, "0")}-00001.mp4`,
  )
}

function emissionFilepaths(count: number) {
  return Array.from(
    { length: count },
    (_, i) => `/emissions/${String(i + 1).padStart(5, "0")}-00001.emissions`,
  )
}

function errorMessage(fn: () => void) {
  try {
    fn()
  } catch (error) {
    assert.ok(error instanceof Error)
    return error.message
  }

  assert.fail("Expected checkAudioEmissionsPairing to throw")
}

void describe("checkAudioEmissionsPairing", () => {
  void it("accepts an equal number of audio and emission files", () => {
    try {
      checkAudioEmissionsPairing(audiofiles(3), emissionFilepaths(3))
    } catch (error) {
      assert.fail(`Expected no error, got ${String(error)}`)
    }
  })

  void it("reports the audio files that have no emissions", () => {
    const message = errorMessage(() => {
      checkAudioEmissionsPairing(audiofiles(3), emissionFilepaths(2))
    })

    assert.match(message, /3 audio files but 2 emission files/)
    assert.ok(message.includes(audiofiles(3)[2]!))
    assert.ok(!message.includes(audiofiles(3)[1]!))
  })

  void it("reports the emission files that have no audio file", () => {
    const message = errorMessage(() => {
      checkAudioEmissionsPairing(audiofiles(2), emissionFilepaths(3))
    })

    assert.match(message, /2 audio files but 3 emission files/)
    assert.ok(message.includes(emissionFilepaths(3)[2]!))
  })

  void it("names every unpaired file", () => {
    const message = errorMessage(() => {
      checkAudioEmissionsPairing(audiofiles(5), emissionFilepaths(2))
    })

    for (const filepath of audiofiles(5).slice(2)) {
      assert.ok(message.includes(filepath))
    }
  })
})

void describe("narrowToAvailableBoundary", () => {
  void it("keeps the range forward when a region is nested inside another", () => {
    // A short chapter matched inside a longer chapter's consumption region.
    // Pairing consecutive endpoints without merging first would form the gap
    // (1000, 500) and return a range running backwards.
    assert.deepStrictEqual(
      narrowToAvailableBoundary(
        [
          [100, 1000],
          [500, 600],
        ],
        { start: 990, end: 1200 },
      ),
      { start: 1001, end: 1200 },
    )
  })

  void it("handles the region order the aligner reports them in", () => {
    // Magisteria: [995296, 996906] lands inside [912859, 1080856].
    assert.deepStrictEqual(
      narrowToAvailableBoundary(
        [
          [912859, 1080856],
          [995296, 996906],
        ],
        { start: 1080725, end: 1177168 },
      ),
      { start: 1080857, end: 1177168 },
    )
  })

  void it("narrows to the largest disjoint gap", () => {
    assert.deepStrictEqual(
      narrowToAvailableBoundary(
        [
          [100, 200],
          [300, 400],
        ],
        { start: 150, end: 350 },
      ),
      { start: 201, end: 299 },
    )
  })

  void it("returns the boundary unchanged when no frame is available", () => {
    // The caller treats start === end as "chapter not found".
    assert.deepStrictEqual(
      narrowToAvailableBoundary([[100, 200]], { start: 200, end: 200 }),
      { start: 200, end: 200 },
    )
  })
})

void describe("findDominantRun", () => {
  /** One character per frame span, laid out from the given start frames. */
  function alignments(spans: [number, number][]): TokenAlignment[] {
    return spans.map(([startFrame, endFrame]) => ({
      label: 0,
      startFrame,
      endFrame,
      score: 0,
    }))
  }

  void it("keeps the whole sentence when no gap exceeds the limit", () => {
    const a = alignments([
      [0, 2],
      [3, 5],
      [30, 31],
      [32, 40],
    ])
    assert.deepStrictEqual(findDominantRun(a, 0, 3, 100), [0, 3])
  })

  void it("drops a tail deferred across a long silence", () => {
    // "…skitte" ends at frame 100; "red down…" resumes 368 frames later
    const a = alignments([
      [0, 10],
      [11, 20],
      [21, 100],
      [468, 470],
      [471, 480],
    ])
    assert.deepStrictEqual(findDominantRun(a, 0, 4, 150), [0, 2])
  })

  void it("drops a head pulled early across a long silence", () => {
    const a = alignments([
      [0, 1],
      [400, 410],
      [411, 420],
      [421, 430],
    ])
    assert.deepStrictEqual(findDominantRun(a, 0, 3, 150), [1, 3])
  })

  void it("prefers the earlier run on ties", () => {
    const a = alignments([
      [0, 1],
      [2, 3],
      [500, 501],
      [502, 503],
    ])
    assert.deepStrictEqual(findDominantRun(a, 0, 3, 150), [0, 1])
  })

  void it("handles a single-character sentence", () => {
    assert.deepStrictEqual(
      findDominantRun(alignments([[7, 9]]), 0, 0, 150),
      [0, 0],
    )
  })

  void it("only looks at the requested offsets", () => {
    const a = alignments([
      [0, 1],
      [1000, 1001],
      [1002, 1003],
      [1004, 1005],
      [3000, 3001],
    ])
    assert.deepStrictEqual(findDominantRun(a, 1, 3, 150), [1, 3])
  })
})

void describe("extendDominantRun", () => {
  function alignments(spans: [number, number][]): TokenAlignment[] {
    return spans.map(([startFrame, endFrame]) => ({
      label: 0,
      startFrame,
      endFrame,
      score: 0,
    }))
  }

  void it("returns the run's own frames when it covers the whole sentence", () => {
    const a = alignments([
      [10, 12],
      [13, 15],
      [16, 20],
    ])
    assert.deepStrictEqual(extendDominantRun(a, 0, 2, 0, 2), [10, 20])
  })

  void it("extends over a deferred tail at the run's rate", () => {
    // 4-char run over 40 frames (10 fpc); 2 deferred chars → +20 frames
    const a = alignments([
      [0, 10],
      [11, 20],
      [21, 30],
      [31, 40],
      [500, 501],
      [502, 503],
    ])
    assert.deepStrictEqual(extendDominantRun(a, 0, 5, 0, 3), [0, 60])
  })

  void it("never reaches the frames the tail was misplaced onto", () => {
    // 20 deferred chars would want +200 frames but the gap is only 160
    const spans: [number, number][] = [
      [0, 10],
      [11, 20],
      [21, 30],
      [31, 40],
    ]
    for (let i = 0; i < 20; i++) spans.push([200 + i, 200 + i])
    const a = alignments(spans)
    assert.deepStrictEqual(extendDominantRun(a, 0, 23, 0, 3), [0, 199])
  })

  void it("extends backwards over a head pulled early", () => {
    // 2 pulled chars, run of 4 chars over 40 frames → start 20 frames earlier
    const a = alignments([
      [0, 1],
      [2, 3],
      [400, 410],
      [411, 420],
      [421, 430],
      [431, 440],
    ])
    assert.deepStrictEqual(extendDominantRun(a, 0, 5, 2, 5), [380, 440])
  })
})
