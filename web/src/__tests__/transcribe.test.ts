import assert from "assert"
import { writeFile } from "fs/promises"
import { describe, it } from "node:test"
import { join } from "path"

import { type Settings } from "@/apiModels"
import { transcribeTrack } from "@/transcribe"

void describe("transcribe", () => {
  // This test is quite slow, and mostly just testing
  // that the integration with whisperx works. It should
  // only be run manually.
  void it.skip("can transcribe a track", async () => {
    const trackPath = join(
      "src",
      "__fixtures__",
      "mobydick_001_002_melville.mp3",
    )

    const transcription = await transcribeTrack(
      trackPath,
      new Intl.Locale("en-US"),
      {
        parallelTranscodes: 1,
        parallelTranscribes: 1,
        whisperThreads: 1,
        whisperModelOverrides: {},
        autoDetectLanguage: false,
      } as Settings,
      AbortSignal.timeout(60_000),
    )

    await writeFile(
      join("src", "__fixtures__", "mobydick_001_002_melville.json"),
      JSON.stringify(
        {
          transcript: transcription.transcript,
          timeline: transcription.timeline,
        },
        null,
        2,
      ),
    )

    assert.deepStrictEqual(transcription.timeline[0]?.endTime, 3.871)
    assert.deepStrictEqual(
      transcription.timeline[0].text,
      " This is a LibraVox recording.",
    )
  })
})
