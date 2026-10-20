import assert from "node:assert"
import { randomUUID } from "node:crypto"
import { mkdir, rm } from "node:fs/promises"
import { join } from "node:path"

import { describe, it } from "vitest"

import { Audiobook } from "@storyteller-platform/audiobook"
import { detectVoiceActivity } from "@storyteller-platform/ghost-story/vad"

import { splitFile } from "../../common/ffmpeg.ts"
import {
  chooseChapterCut,
  getSafeChapterRanges,
  getSafeRanges,
} from "../ranges.ts"

const itLocally = process.env["TEST_LOCAL_ONLY"] ? it : it.skip

describe("chooseChapterCut", () => {
  it("keeps a mark that already sits in a silence", () => {
    assert.deepStrictEqual(
      chooseChapterCut(100, [
        { start: 90, end: 91 },
        { start: 98, end: 103 },
      ]),
      { cut: 100, reason: "in-silence" },
    )
  })

  it("moves a mark placed just after a word onset back into the preceding pause", () => {
    // Night.m4b: marks land 0.06–0.25 s into the chapter's first word
    assert.deepStrictEqual(
      chooseChapterCut(2570.19, [
        { start: 2566.5, end: 2569.94 },
        { start: 2571.96, end: 2572.79 },
      ]),
      { cut: (2566.5 + 2569.94) / 2, reason: "moved" },
    )
  })

  it("moves a mark placed before the previous sentence finished forward into the following pause", () => {
    assert.deepStrictEqual(
      chooseChapterCut(100, [
        { start: 92, end: 94 },
        { start: 101.5, end: 103.5 },
      ]),
      { cut: 102.5, reason: "moved" },
    )
  })

  it("measures distance to the nearest edge, not the midpoint", () => {
    // The long pause before is closer than the short one after
    assert.deepStrictEqual(
      chooseChapterCut(100, [
        { start: 90, end: 99.5 },
        { start: 101, end: 101.5 },
      ]),
      { cut: 94.75, reason: "moved" },
    )
  })

  it("ignores gaps too short to be sentence breaks", () => {
    assert.deepStrictEqual(
      chooseChapterCut(100, [
        { start: 99.9, end: 100.1 },
        { start: 102, end: 104 },
      ]),
      { cut: 103, reason: "moved" },
    )
  })

  it("keeps the mark when no silence is within reach", () => {
    assert.deepStrictEqual(
      chooseChapterCut(100, [
        { start: 80, end: 82 },
        { start: 115, end: 117 },
      ]),
      { cut: 100, reason: "no-silence-nearby" },
    )
  })
})

/** The non-speech stretches within ±window seconds of `time`, relative to it. */
async function silencesAround(input: string, time: number, window: number) {
  const dir = join("src", "__fixtures__", "__output__", randomUUID())
  await mkdir(dir, { recursive: true })
  try {
    const wav = join(dir, "probe.wav")
    await splitFile(input, wav, time - window, time + window, {})
    const timeline = await detectVoiceActivity(wav, {
      engine: "active-gate-og",
    })
    return timeline
      .filter((s) => !s.isSpeech)
      .map((s) => ({ start: s.startTime - window, end: s.endTime - window }))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/**
 * VAD segment edges shift by a few milliseconds depending on how the probe
 * window is cut, and getSafeRanges cuts exactly on an edge, so allow 50 ms.
 */
function assertInSilence(silences: { start: number; end: number }[]) {
  assert.ok(
    silences.some(
      (s) =>
        s.start - 0.05 <= 0 && 0 <= s.end + 0.05 && s.end - s.start >= 0.25,
    ),
    `cut falls in speech; nearby silences: ${JSON.stringify(silences)}`,
  )
}

const mobyDick = join(
  "src",
  "__fixtures__",
  "mpeg4",
  "MobyDickOrTheWhalePart1_librivox.m4b",
)

describe("getSafeRanges", () => {
  it("cuts inside pauses", async () => {
    using audiobook = await Audiobook.from(mobyDick)
    const duration = await audiobook.getDuration()

    const ranges = await getSafeRanges(mobyDick, duration, 1800)

    assert.ok(ranges.length > 5)
    for (let i = 0; i + 1 < ranges.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const cut = ranges[i]!.end
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      assert.ok(ranges[i + 1]!.start >= cut)
      assertInSilence(await silencesAround(mobyDick, cut, 5))
    }
  })
})

describe("getSafeChapterRanges", () => {
  it("keeps chapter marks that already fall in pauses", async () => {
    using audiobook = await Audiobook.from(mobyDick)
    const duration = await audiobook.getDuration()
    const chapters = await audiobook.getChapters()

    const ranges = await getSafeChapterRanges(
      mobyDick,
      duration,
      chapters,
      Infinity,
    )

    assert.deepStrictEqual(
      ranges.map((r) => r.start),
      chapters.map((c) => c.start),
    )
  })

  // Night.m4b is a large local-only fixture whose chapter marks land inside
  // the chapter's first word
  itLocally("moves chapter marks that fall in speech to a pause", async () => {
    const night = join("src", "align", "__fixtures__", "night", "Night.m4b")
    using audiobook = await Audiobook.from(night)
    const duration = await audiobook.getDuration()
    const chapters = await audiobook.getChapters()

    const ranges = await getSafeChapterRanges(
      night,
      duration,
      chapters,
      Infinity,
    )

    const moved = ranges.filter(
      (r, i) => i > 0 && r.start !== (chapters[i]?.start ?? 0),
    )
    assert.ok(moved.length >= 8, `only ${moved.length} marks moved`)
    for (const range of ranges.slice(1)) {
      assertInSilence(await silencesAround(night, range.start, 5))
    }
  })
})
