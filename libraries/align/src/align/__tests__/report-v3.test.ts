import assert from "node:assert"
import { describe, it } from "node:test"

import { type SentenceRange } from "../getSentenceRanges.ts"
import { assembleReport, buildChapterSpans } from "../report-v3.ts"

function range(
  id: number,
  start: number,
  end: number,
  audiofile = "a.mp3",
  interpolated = false,
): SentenceRange {
  return { chapterId: "ch", id, start, end, audiofile, interpolated }
}

const tracks = ["a.mp3", "b.mp3"]
const trackIndex = (file: string) => tracks.indexOf(file)

void describe("buildChapterSpans", () => {
  void it("tiles a chapter into aligned, interpolated and unmatched runs", () => {
    const spans = buildChapterSpans({
      spine: 4,
      sentenceCount: 7,
      ranges: [
        range(0, 10, 12.4, "a.mp3", true),
        range(1, 12.4, 14),
        range(2, 14, 15.9),
        range(3, 15.9, 18, "a.mp3", true),
        range(4, 18, 21.3, "a.mp3", true),
        range(5, 21.3, 23),
        range(6, 23, 30, "a.mp3", true),
      ],
      trackIndex,
      sentenceScore: (id) => (id === 1 ? 90 : id === 2 ? 92 : 88),
    })

    assert.deepStrictEqual(spans, [
      {
        spine: 4,
        firstSentence: 0,
        lastSentence: 0,
        state: "unmatched",
        audio: null,
      },
      {
        spine: 4,
        firstSentence: 1,
        lastSentence: 2,
        state: "aligned",
        audio: { track: 0, start: 12.4, end: 15.9 },
        score: 91,
      },
      {
        spine: 4,
        firstSentence: 3,
        lastSentence: 4,
        state: "interpolated",
        audio: { track: 0, start: 15.9, end: 21.3 },
      },
      {
        spine: 4,
        firstSentence: 5,
        lastSentence: 5,
        state: "aligned",
        audio: { track: 0, start: 21.3, end: 23 },
        score: 88,
      },
      {
        spine: 4,
        firstSentence: 6,
        lastSentence: 6,
        state: "unmatched",
        audio: null,
      },
    ])
  })

  void it("splits an aligned run at a track boundary", () => {
    const spans = buildChapterSpans({
      spine: 0,
      sentenceCount: 4,
      ranges: [
        range(0, 100, 110),
        range(1, 110, 120),
        range(2, 0, 5, "b.mp3"),
        range(3, 5, 9, "b.mp3"),
      ],
      trackIndex,
      sentenceScore: () => null,
    })
    assert.deepStrictEqual(
      spans.map((span) => [
        span.firstSentence,
        span.lastSentence,
        span.audio?.track,
      ]),
      [
        [0, 1, 0],
        [2, 3, 1],
      ],
    )
  })

  void it("labels sentences without any range as unmatched", () => {
    const spans = buildChapterSpans({
      spine: 2,
      sentenceCount: 3,
      ranges: [],
      trackIndex,
      sentenceScore: () => null,
    })
    assert.deepStrictEqual(spans, [
      {
        spine: 2,
        firstSentence: 0,
        lastSentence: 2,
        state: "unmatched",
        audio: null,
      },
    ])
  })
})

/* eslint-disable @typescript-eslint/no-non-null-assertion */
void describe("assembleReport", () => {
  void it("rolls spans up into spine items, tracks and totals", () => {
    const report = assembleReport({
      aligner: "ctc",
      spine: [
        {
          index: 1,
          href: "ch1.xhtml",
          title: "One",
          status: "aligned",
          sentenceCount: 4,
          firstMatch: null,
          lastMatch: null,
          preview: null,
        },
        {
          index: 0,
          href: "nav.xhtml",
          title: null,
          status: "is-nav",
          sentenceCount: 0,
          firstMatch: null,
          lastMatch: null,
          preview: null,
        },
        {
          index: 2,
          href: "ch2.xhtml",
          title: null,
          status: "aligned",
          sentenceCount: 2,
          firstMatch: null,
          lastMatch: null,
          preview: null,
        },
      ],
      tracks: [
        { index: 0, name: "a.mp3", duration: 100, offset: 0, source: null },
        { index: 1, name: "b.mp3", duration: 50, offset: 100, source: null },
      ],
      spans: [
        {
          spine: 1,
          firstSentence: 0,
          lastSentence: 1,
          state: "aligned",
          audio: { track: 0, start: 0, end: 30 },
          score: 80,
        },
        {
          spine: 1,
          firstSentence: 2,
          lastSentence: 2,
          state: "interpolated",
          audio: { track: 0, start: 30, end: 40 },
        },
        {
          spine: 1,
          firstSentence: 3,
          lastSentence: 3,
          state: "aligned",
          audio: { track: 0, start: 40, end: 60 },
          score: 100,
        },
        {
          spine: 2,
          firstSentence: 0,
          lastSentence: 1,
          state: "unmatched",
          audio: null,
        },
      ],
    })

    assert.deepStrictEqual(
      report.spine.map((item) => [item.index, item.status, item.score]),
      [
        [0, "is-nav", null],
        [1, "aligned", 86.7],
        [2, "not-found", null],
      ],
    )
    assert.strictEqual(report.spine[1]!.matchedSentenceCount, 3)
    assert.strictEqual(report.spine[1]!.interpolatedSentenceCount, 1)
    assert.strictEqual(report.spine[1]!.matchedSeconds, 50)
    assert.strictEqual(report.tracks[0]!.matchedSeconds, 50)
    assert.strictEqual(report.tracks[0]!.interpolatedSeconds, 10)
    assert.deepStrictEqual(report.totals, {
      sentences: 6,
      matchedSentences: 3,
      interpolatedSentences: 1,
      unmatchedSentences: 2,
      seconds: 150,
      matchedSeconds: 50,
      interpolatedSeconds: 10,
      spine: {
        aligned: 1,
        "not-found": 1,
        "too-short": 0,
        "is-nav": 1,
        "no-text": 0,
      },
      tracks: 2,
      unalignedTracks: 1,
    })
  })
})
