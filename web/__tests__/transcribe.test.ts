import { describe, it } from "node:test"
import { join } from "path"
import { transcribeTrack } from "@/transcribe"
import assert from "assert"

void describe("transcribe", () => {
  // This test is quite slow, and mostly just testing
  // that the integration with whisperx works. It should
  // only be run manually.
  void it.skip("can transcribe a track", async () => {
    const trackPath = join("__fixtures__", "mobydick_001_002_melville.mp3")
    const transcription = await transcribeTrack(
      trackPath,
      "cpu",
      "int8",
      16,
      "The following is a transcription of Moby Dick by Herman Melville. Please transcribe it.",
    )
    assert.deepStrictEqual(transcription.segments[0]!.start, 2.25)
    assert.deepStrictEqual(transcription.segments[0]!.end, 3.871)
    assert.deepStrictEqual(
      transcription.segments[0]!.text,
      " This is a LibraVox recording.",
    )
  })
})
