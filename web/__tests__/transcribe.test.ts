import { describe, it } from "node:test"
import { join } from "path"
import { transcribeTrack } from "@/transcribe"
import assert from "assert"
import { setGlobalOption } from "echogarden/dist/api/GlobalOptions"
import { writeFile } from "fs/promises"

setGlobalOption("logLevel", "error")

void describe("transcribe", () => {
  // This test is quite slow, and mostly just testing
  // that the integration with whisperx works. It should
  // only be run manually.
  void it.skip("can transcribe a track", async () => {
    const trackPath = join("__fixtures__", "mobydick_001_002_melville.mp3")
    const transcription = await transcribeTrack(
      trackPath,
      "The following is a recording of Moby Dick by Herman Melville. Please transcribe it.",
      "en",
    )

    await writeFile(
      join("__fixtures__", "mobydick_001_002_melville.json"),
      JSON.stringify(
        {
          transcript: transcription.transcript,
          wordTimeline: transcription.wordTimeline,
        },
        null,
        2,
      ),
    )

    assert.deepStrictEqual(
      transcription.wordTimeline[0]?.timeline?.[0]?.endTime,
      3.871,
    )
    assert.deepStrictEqual(
      transcription.wordTimeline[0]?.text,
      " This is a LibraVox recording.",
    )
  })
})
