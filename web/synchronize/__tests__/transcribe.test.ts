import { describe, it } from "node:test"
import { join } from "path"
import {
  getAlignModel,
  getTranscribeModel,
  transcribeTrack,
} from "../transcribe"
import assert from "assert"

describe("transcribe", () => {
  // This test is quite slow, and mostly just testing
  // that the integration with whisperx works. It should
  // only be run manually.
  it("can transcribe a track", () => {
    const trackPath = join(
      "..",
      "assets",
      "audio",
      "8ca5dac3-e3f2-4e8b-b77d-dcf53bf5f135",
      "original",
      "The_Frugal_Wizard_s_Handbook_for_Surviving_Medieval_England_by_Brandon_Sanderson.mp4",
    )
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
