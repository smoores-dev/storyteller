import assert from "node:assert"

import { describe, it } from "vitest"

import { MediaType } from "@storyteller-platform/media-types"

import { canCopyCodec, outputContainer } from "../containers.ts"

describe("outputContainer", () => {
  const legacyDetermineExtension = (codec: string | null, ext: string) => {
    if (codec === "libmp3lame") return ".mp3"
    if (codec === "aac" || codec === "libopus") return ".mp4"
    if (ext === ".mp3") return ".mp3"
    if (
      [
        ".mp4",
        ".m4a",
        ".m4b",
        ".ogg",
        ".oga",
        ".mogg",
        ".opus",
        ".aac",
      ].includes(ext)
    ) {
      return ".mp4"
    }
    return ext
  }

  const CODECS = [null, "libmp3lame", "aac", "libopus", "copy"]
  const SOURCES = [
    ".mp3",
    ".m4a",
    ".m4b",
    ".mp4",
    ".aac",
    ".ogg",
    ".oga",
    ".opus",
    ".wav",
    ".aiff",
    ".flac",
    ".alac",
    ".weba",
  ]

  for (const codec of CODECS) {
    it(`agrees with the old determineExtension for codec ${String(codec)}`, () => {
      for (const source of SOURCES) {
        assert.strictEqual(
          outputContainer(codec, MediaType.fromExtension(source))?.extension ??
            null,
          legacyDetermineExtension(codec, source),
          `codec ${String(codec)} with source ${source}`,
        )
      }
    })
  }

  it("files any known encoder under its playable container", () => {
    assert.strictEqual(outputContainer("mp3", null), MediaType.MPEG_AUDIO)
    assert.strictEqual(outputContainer("opus", null), MediaType.MP4_AUDIO)
    assert.strictEqual(outputContainer("flac", null), MediaType.FLAC_AUDIO)
    assert.strictEqual(outputContainer("mjpeg", null), null)
  })

  it("returns null when nothing is known", () => {
    assert.strictEqual(outputContainer(null, null), null)
    assert.strictEqual(outputContainer("copy", MediaType.EPUB), null)
  })
})

describe("canCopyCodec", () => {
  it("copies within a container and into mp4", () => {
    assert.ok(canCopyCodec(MediaType.MPEG_AUDIO, MediaType.MPEG_AUDIO))
    assert.ok(canCopyCodec(MediaType.OGG_AUDIO, MediaType.MP4_AUDIO))
    assert.ok(!canCopyCodec(MediaType.OGG_AUDIO, MediaType.MPEG_AUDIO))
    assert.ok(!canCopyCodec(null, null))
  })
})
