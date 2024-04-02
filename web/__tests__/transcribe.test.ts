import { describe, it } from "node:test"
import { join } from "path"
import {
  getAlignModel,
  getTranscribeModel,
  transcribeTrack,
} from "@/transcribe"
import assert from "assert"

describe("transcribe", () => {
  // This test is quite slow, and mostly just testing
  // that the integration with whisperx works. It should
  // only be run manually.
  it.skip("can transcribe a track", () => {
    const trackPath = join("__fixtures__", "mobydick_001_002_melville.mp3")
    const transcribeModel = getTranscribeModel(
      "cpu",
      "int8",
      "The following is a transcription of Moby Dick by Herman Melville. Please transcribe it.",
    )
    const { alignModel, alignMetadata } = getAlignModel("cpu")
    const transcription = transcribeTrack(
      trackPath,
      "cpu",
      transcribeModel,
      alignModel,
      alignMetadata,
      16,
    )
    assert.deepStrictEqual(transcription.segments[0]!.start, 2.25)
    assert.deepStrictEqual(transcription.segments[0]!.end, 3.871)
    assert.deepStrictEqual(
      transcription.segments[0]!.text,
      " This is a LibraVox recording.",
    )
  })
})
