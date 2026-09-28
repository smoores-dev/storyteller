import assert from "node:assert"

import { describe, it } from "vitest"

import {
  type RawWhisperSegment,
  calculateWhisperSplits,
  extractCorrectedTimeline,
} from "../src/utilities/WhisperTimeline.ts"

const segment = (
  segmentStart: number,
  segmentEnd: number,
  words: [string, number, number][],
): RawWhisperSegment => ({
  text: words.map(([text]) => text).join(""),
  segmentStart,
  segmentEnd,
  words: words.map(([text, start, end]) => ({
    text,
    start,
    end,
    confidence: 0.9,
  })),
})

describe("extractCorrectedTimeline", () => {
  it("moves each word by the start of the part whisper transcribed it in", () => {
    const splits = calculateWhisperSplits(150.00013, 2)
    const timeline = extractCorrectedTimeline(
      [
        segment(10, 12, [
          [" Call", 10, 10.4],
          [" me", 10.4, 10.6],
        ]),
        segment(73.9, 74.99, [[" Ishmael.", 73.9, 74.6]]),
        segment(74.99, 78, [
          [" Some", 0.2, 0.6],
          [" years", 0.6, 1],
        ]),
        segment(80, 82, [
          [" ago", 5, 5.4],
          ["—never", 5.4, 5.9],
        ]),
      ],
      { splitBoundaries: splits },
    )
    assert.deepStrictEqual(
      timeline.map(({ text, startTime, endTime }) => [
        text,
        Number(startTime.toFixed(3)),
        Number(endTime.toFixed(3)),
      ]),
      [
        ["Call", 10, 10.4],
        ["me", 10.4, 10.6],
        ["Ishmael.", 73.9, 74.6],
        ["Some", 75.2, 75.6],
        ["years", 75.6, 76],
        ["ago—never", 80, 80.9],
      ],
    )
  })

  it("keeps a part that runs long from pushing the next part later", () => {
    const timeline = extractCorrectedTimeline(
      [
        segment(70, 88, [
          [" deep", 70, 70.5],
          [" wood", 80, 88],
        ]),
        segment(88, 90, [[" lands", 88, 90]]),
        segment(90, 77, [
          [" winds", 0.1, 0.5],
          [" a", 0.5, 0.6],
        ]),
        segment(77, 80, [[" mazy", 2, 2.5]]),
      ],
      { splitBoundaries: [75] },
    )
    assert.deepStrictEqual(
      timeline.map(({ text, startTime }) => [text, startTime]),
      [
        ["deep", 70],
        ["wood", 75],
        ["lands", 75],
        ["winds", 75.1],
        ["a", 75.5],
        ["mazy", 77],
      ],
    )
  })
})
