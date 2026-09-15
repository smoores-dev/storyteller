import assert from "node:assert"
import { describe, it } from "node:test"

import { type Emissions } from "@storyteller-platform/ghost-story"

import { ctcViterbiAlign } from "../forcedAlign.ts"

/**
 * Build a synthetic emission matrix where blank is high at every frame
 * except where specific tokens are forced high.
 *
 * @param forced   Array of {frame, token} pairs to override.
 * @param numFrames Total number of frames.
 * @param vocabSize  Total number of tokens in the vocabulary.
 * @param blankId    The blank token id.
 * @param highScore  Log-prob for the dominant token (default 0.0).
 * @param lowScore   Log-prob for all other tokens (default -10.0).
 * @returns A frames × vocabSize matrix of log-softmax scores.
 */
function buildEmissionsWithBlanks(
  forced: { frame: number; token: number }[],
  numFrames: number,
  vocabSize: number,
  blankId: number,
  highScore = 0,
  lowScore = -10,
): Emissions {
  const values = new Float32Array(numFrames * vocabSize).fill(lowScore)
  for (let t = 0; t < numFrames; t++) {
    values[t * vocabSize + blankId] = highScore
  }
  for (const { frame, token } of forced) {
    values[frame * vocabSize + token] = highScore
    values[frame * vocabSize + blankId] = lowScore
  }
  return { values, frames: numFrames, classes: vocabSize }
}

void describe("ctcViterbiAlign", () => {
  // Vocab layout for most tests:
  //   0 = blank
  //   1 = 'a'
  //   2 = 'b'
  //   3 = 'c'
  //   4 = 'd'
  //   5 = star (pseudo-token, outside normal vocab)
  const BLANK = 0
  const STAR = 5
  const STAR_SCORE = -1

  void it("recovers a simple single-character label", () => {
    // 'a' at frames 2-3, with enough trailing blank frames for the path
    // to reach the termination state (state 6 = trailing blank).
    // Labels [STAR, 1, STAR] → 7 states, termination at state 6.
    // From state 3 (label 'a') to state 6 requires 3 transitions,
    // so we need at least 3 blank frames after the last 'a' frame.
    const emissions = buildEmissionsWithBlanks(
      [
        { frame: 2, token: 1 },
        { frame: 3, token: 1 },
      ],
      8, // frames 0-7, with 4 trailing blank frames
      6,
      BLANK,
    )

    const result = ctcViterbiAlign(
      emissions,
      [STAR, 1, STAR],
      BLANK,
      STAR,
      STAR_SCORE,
    )

    assert.equal(result.length, 3)
    assert.equal(result[1]!.label, 1)
    assert.equal(result[1]!.startFrame, 2)
    assert.equal(result[1]!.endFrame, 3)
  })

  void it("recovers a multi-character label sequence", () => {
    // "abc": a at frames 2-3, b at frames 5-6, c at frames 8-9
    // With 4 trailing blank frames for termination.
    const emissions = buildEmissionsWithBlanks(
      [
        { frame: 2, token: 1 },
        { frame: 3, token: 1 },
        { frame: 5, token: 2 },
        { frame: 6, token: 2 },
        { frame: 8, token: 3 },
        { frame: 9, token: 3 },
      ],
      14, // frames 0-13
      6,
      BLANK,
    )

    const result = ctcViterbiAlign(
      emissions,
      [STAR, 1, 2, 3, STAR],
      BLANK,
      STAR,
      STAR_SCORE,
    )

    assert.equal(result.length, 5)
    assert.equal(result[1]!.label, 1)
    assert.equal(result[1]!.startFrame, 2)
    assert.equal(result[1]!.endFrame, 3)

    assert.equal(result[2]!.label, 2)
    assert.equal(result[2]!.startFrame, 5)
    assert.equal(result[2]!.endFrame, 6)

    assert.equal(result[3]!.label, 3)
    assert.equal(result[3]!.startFrame, 8)
    assert.equal(result[3]!.endFrame, 9)
  })

  void it("handles repeated letters with the mandatory-blank rule", () => {
    // "aa": a at frames 2-3, blank at frame 4 (mandatory), a at frames 5-6
    // With 3 trailing blank frames for termination.
    const emissions = buildEmissionsWithBlanks(
      [
        { frame: 2, token: 1 },
        { frame: 3, token: 1 },
        { frame: 5, token: 1 },
        { frame: 6, token: 1 },
      ],
      10, // frames 0-9
      6,
      BLANK,
    )

    const result = ctcViterbiAlign(
      emissions,
      [STAR, 1, 1, STAR],
      BLANK,
      STAR,
      STAR_SCORE,
    )

    assert.equal(result.length, 4)
    assert.equal(result[1]!.label, 1)
    assert.equal(result[1]!.startFrame, 2)
    assert.equal(result[1]!.endFrame, 3)

    assert.equal(result[2]!.label, 1)
    assert.equal(result[2]!.startFrame, 5)
    assert.equal(result[2]!.endFrame, 6)
  })

  void it("squeezes second label when no blank separates repeated letters", () => {
    // If 'a' dominates frames 2-5 with no blank gap, the mandatory blank
    // in the state graph means Viterbi must transition through a blank state.
    // Without a blank emission at that position, the second 'a' may be
    // squeezed. This test documents the actual behavior.
    const emissions = buildEmissionsWithBlanks(
      [
        { frame: 2, token: 1 },
        { frame: 3, token: 1 },
        { frame: 4, token: 1 },
        { frame: 5, token: 1 },
      ],
      9, // frames 0-8
      6,
      BLANK,
    )

    const result = ctcViterbiAlign(
      emissions,
      [STAR, 1, 1, STAR],
      BLANK,
      STAR,
      STAR_SCORE,
    )

    assert.equal(result.length, 4)
    const squeezed = result.filter((r) => r.score === -10)
    assert.ok(
      squeezed.length >= 1,
      "Expected at least one squeezed label when no blank separates repeated letters",
    )
  })

  void it("leading star absorbs junk frames before the first label", () => {
    // Frames 0-1: junk (high on token 3, which isn't in the label)
    // Frames 2-3: 'a'
    // With 4 trailing blank frames for termination.
    const emissions = buildEmissionsWithBlanks(
      [
        { frame: 0, token: 3 },
        { frame: 1, token: 3 },
        { frame: 2, token: 1 },
        { frame: 3, token: 1 },
      ],
      8, // frames 0-7
      6,
      BLANK,
    )

    const result = ctcViterbiAlign(
      emissions,
      [STAR, 1, STAR],
      BLANK,
      STAR,
      STAR_SCORE,
    )

    assert.equal(result.length, 3)
    assert.equal(result[1]!.label, 1)
    // The 'a' should start at frame 2, not frame 0
    assert.equal(result[1]!.startFrame, 2)
    assert.equal(result[1]!.endFrame, 3)
  })

  void it("trailing star absorbs junk frames after the last label", () => {
    // Frames 0-1: 'a'
    // Frames 2-3: junk (high on token 3)
    // Frames 4-5: blank (trailing)
    const emissions = buildEmissionsWithBlanks(
      [
        { frame: 0, token: 1 },
        { frame: 1, token: 1 },
        { frame: 2, token: 3 },
        { frame: 3, token: 3 },
      ],
      8, // frames 0-7
      6,
      BLANK,
    )

    const result = ctcViterbiAlign(
      emissions,
      [STAR, 1, STAR],
      BLANK,
      STAR,
      STAR_SCORE,
    )

    assert.equal(result.length, 3)
    assert.equal(result[1]!.label, 1)
    assert.equal(result[1]!.startFrame, 0)
    assert.equal(result[1]!.endFrame, 1)
  })

  void it("returns empty array for empty emissions", () => {
    const result = ctcViterbiAlign(
      { values: new Float32Array(0), frames: 0, classes: 6 },
      [STAR, 1, 2, 3, STAR],
      BLANK,
      STAR,
      STAR_SCORE,
    )
    assert.deepEqual(result, [])
  })

  void it("returns empty array for empty labels", () => {
    const emissions = buildEmissionsWithBlanks([], 10, 6, BLANK)
    const result = ctcViterbiAlign(emissions, [], BLANK, STAR, STAR_SCORE)
    assert.deepEqual(result, [])
  })

  void it("detects squeezed text when labels outnumber available frames", () => {
    // 5 labels but only 3 frames with actual label emissions — at most 3 labels can be occupied
    const emissions = buildEmissionsWithBlanks(
      [
        { frame: 0, token: 1 },
        { frame: 1, token: 2 },
        { frame: 2, token: 3 },
      ],
      10, // frames 0-9
      6,
      BLANK,
    )

    const result = ctcViterbiAlign(
      emissions,
      [STAR, 1, 2, 3, 4, 4, STAR],
      BLANK,
      STAR,
      STAR_SCORE,
    )

    assert.equal(result.length, 7)
    // At least 2 labels should be squeezed (never occupied)
    const squeezed = result.filter((r) => r.score === -10)
    assert.ok(
      squeezed.length >= 2,
      `Expected at least 2 squeezed labels, got ${squeezed.length}`,
    )
  })

  void it("computes per-token mean score correctly", () => {
    // 'a' at frames 2-3 with highScore=0, so mean score should be ~0
    const emissions = buildEmissionsWithBlanks(
      [
        { frame: 2, token: 1 },
        { frame: 3, token: 1 },
      ],
      8, // frames 0-7
      6,
      BLANK,
      0,
      -10,
    )

    const result = ctcViterbiAlign(
      emissions,
      [STAR, 1, STAR],
      BLANK,
      STAR,
      STAR_SCORE,
    )

    assert.equal(result.length, 3)
    // Mean of [0, 0] = 0
    assert.ok(
      Math.abs(result[1]!.score - 0) < 0.001,
      `Expected score ~0, got ${result[0]!.score}`,
    )
  })

  void it("prefers star over a label when the label emission is weak", () => {
    // 'a' is present but with a weak score, while star absorbs most frames
    const emissions = buildEmissionsWithBlanks(
      [{ frame: 2, token: 1 }],
      8, // frames 0-7
      6,
      BLANK,
      -5, // weak high score for 'a'
      -10,
    )

    const result = ctcViterbiAlign(
      emissions,
      [STAR, 1, STAR],
      BLANK,
      STAR,
      STAR_SCORE,
    )

    assert.equal(result.length, 3)
    // 'a' should still be found at frame 2 since it's the only strong signal
    assert.equal(result[1]!.startFrame, 2)
    assert.equal(result[1]!.endFrame, 2)
  })

  void it("aligns a longer sequence with blanks between characters", () => {
    // "abcd" with blanks between each character
    // With 4 trailing blank frames for termination.
    const emissions = buildEmissionsWithBlanks(
      [
        { frame: 1, token: 1 },
        { frame: 2, token: 1 },
        { frame: 4, token: 2 },
        { frame: 5, token: 2 },
        { frame: 7, token: 3 },
        { frame: 8, token: 3 },
        { frame: 10, token: 4 },
        { frame: 11, token: 4 },
      ],
      16, // frames 0-15
      6,
      BLANK,
    )

    const result = ctcViterbiAlign(
      emissions,
      [STAR, 1, 2, 3, 4, STAR],
      BLANK,
      STAR,
      STAR_SCORE,
    )

    assert.equal(result.length, 6)
    assert.equal(result[1]!.startFrame, 1)
    assert.equal(result[1]!.endFrame, 2)
    assert.equal(result[2]!.startFrame, 4)
    assert.equal(result[2]!.endFrame, 5)
    assert.equal(result[3]!.startFrame, 7)
    assert.equal(result[3]!.endFrame, 8)
    assert.equal(result[4]!.startFrame, 10)
    assert.equal(result[4]!.endFrame, 11)
  })

  void it("handles three consecutive identical letters", () => {
    // "aaa": a at frames 2-3, blank at 4, a at 5-6, blank at 7, a at 8-9
    // With 3 trailing blank frames for termination.
    const emissions = buildEmissionsWithBlanks(
      [
        { frame: 2, token: 1 },
        { frame: 3, token: 1 },
        { frame: 5, token: 1 },
        { frame: 6, token: 1 },
        { frame: 8, token: 1 },
        { frame: 9, token: 1 },
      ],
      13, // frames 0-12
      6,
      BLANK,
    )

    const result = ctcViterbiAlign(
      emissions,
      [STAR, 1, 1, 1, STAR],
      BLANK,
      STAR,
      STAR_SCORE,
    )

    assert.equal(result.length, 5)
    assert.equal(result[1]!.startFrame, 2)
    assert.equal(result[1]!.endFrame, 3)
    assert.equal(result[2]!.startFrame, 5)
    assert.equal(result[2]!.endFrame, 6)
    assert.equal(result[3]!.startFrame, 8)
    assert.equal(result[3]!.endFrame, 9)
  })

  void it("returns label tokens in the alignment results", () => {
    // Verify that the label field in each TokenAlignment matches the input
    const emissions = buildEmissionsWithBlanks(
      [
        { frame: 2, token: 1 },
        { frame: 3, token: 1 },
        { frame: 5, token: 2 },
        { frame: 6, token: 2 },
      ],
      10,
      6,
      BLANK,
    )

    const result = ctcViterbiAlign(
      emissions,
      [STAR, 1, 2, STAR],
      BLANK,
      STAR,
      STAR_SCORE,
    )

    assert.equal(result.length, 4)
    assert.equal(result[1]!.label, 1)
    assert.equal(result[2]!.label, 2)
  })

  void it("handles a single label with no trailing blank frames", () => {
    // The termination requires reaching the last state. With just enough
    // frames, the label should still be found.
    // Labels [STAR, 1, STAR] → 7 states. Termination at state 6.
    // From state 3 (label) to state 6 needs 3 frames minimum.
    // So we need: label frame + 3 trailing frames = 4 frames minimum.
    const emissions = buildEmissionsWithBlanks(
      [{ frame: 0, token: 1 }],
      4, // frames 0-3: label at 0, then 3 blank frames
      6,
      BLANK,
    )

    const result = ctcViterbiAlign(
      emissions,
      [STAR, 1, STAR],
      BLANK,
      STAR,
      STAR_SCORE,
    )

    assert.equal(result.length, 3)
    assert.equal(result[1]!.label, 1)
    assert.equal(result[1]!.startFrame, 0)
    assert.equal(result[1]!.endFrame, 0)
  })
})
