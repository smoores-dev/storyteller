import assert from "node:assert"
import { describe, it } from "node:test"

import { createTiming } from "../src/index.ts"
import {
  type Language,
  type RecognitionResult,
  recognize,
} from "../src/recognition/WhisperCppSTT.js"
import { spacelessScriptPattern } from "../src/utilities/SpacelessScripts.ts"
import {
  type Timeline,
  addWordTextOffsetsToTimelineInPlace,
  buildTranscriptFromTimeline,
} from "../src/utilities/Timeline.ts"

const MAX_WORD_LENGTH = 10
const MAX_WORD_DURATION_SECONDS = 10

interface Sample {
  file: string
  language: Language
}

const samples: Sample[] = [
  { file: "japanese.mp3", language: "ja" },
  { file: "mandarin.mp3", language: "zh" },
  // hangul uses spaces
  // { file: "korean.mp3", language: "ko" },
  { file: "thai.mp3", language: "th" },
]

const isCompletelySpacelessScript = (text: string): boolean => {
  return new RegExp(`^${spacelessScriptPattern.source}*$`).test(text)
}

function assertNoLargeAccumulations(result: RecognitionResult, label: string) {
  assert.ok(
    result.timeline.length > 5,
    `${label}: expected more than 5 timeline entries, got ${result.timeline.length}`,
  )

  let correctWords = 0

  for (const entry of result.timeline) {
    if (!isCompletelySpacelessScript(entry.text)) {
      continue
    }

    assert.ok(
      entry.text.length <= MAX_WORD_LENGTH,
      `${label}: entry text too long (${entry.text.length} chars): "${entry.text.slice(0, 40)}..."`,
    )

    const duration = entry.endTime - entry.startTime
    assert.ok(
      duration <= MAX_WORD_DURATION_SECONDS,
      `${label}: entry duration too long (${duration.toFixed(1)}s) for "${entry.text.slice(0, 20)}"`,
    )
    correctWords++
  }

  assert.ok(
    correctWords > 10,
    `${label}: expected at least 10 correct words, got ${correctWords}. Timeline: ${JSON.stringify(result.timeline, null, 2)}`,
  )

  assert.ok(
    !result.timeline.some((e) => e.text.includes("\uFFFD")),
    `${label}: found replacement characters in timeline`,
  )
}

function assertMonotonicOffsets(timeline: Timeline) {
  let lastEndOffset = 0
  for (let i = 0; i < timeline.length; i++) {
    const entry = timeline[i]!

    assert.ok(
      entry.endOffsetUtf32 !== undefined &&
        entry.endOffsetUtf32 > lastEndOffset,
      `timeline entry ${JSON.stringify(entry)} has end offset ${entry.endOffsetUtf32} which is not greater than the last end offset ${lastEndOffset}`,
    )

    lastEndOffset = entry.endOffsetUtf32 ?? 0
  }
}

void describe("spaceless script transcription", () => {
  for (const sample of samples) {
    void it(
      `should produce granular timeline entries for ${sample.language}`,
      { timeout: 120_000 },
      async () => {
        const audioPath = new URL(
          `./test-data/no-space-script/${sample.file}`,
          import.meta.url,
        )

        const result = await recognize(audioPath.pathname, createTiming(), {
          language: sample.language,
          model: "tiny",
          printOutput: false,
          flashAttention: false,
        })
        assertNoLargeAccumulations(result, sample.language)

        const transcript = buildTranscriptFromTimeline(result.timeline)

        addWordTextOffsetsToTimelineInPlace(result.timeline, transcript)

        assertMonotonicOffsets(result.timeline)
      },
    )
  }
})
