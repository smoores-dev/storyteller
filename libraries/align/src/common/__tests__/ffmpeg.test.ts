import assert from "node:assert"
import { join } from "node:path"

import { describe, it } from "vitest"

import { isVbrMp3 } from "../ffmpeg.ts"

const fixture = (...parts: string[]) =>
  join("src", "__fixtures__", "mp3", ...parts)

describe("isVbrMp3", () => {
  it("reports a constant bitrate MP3 as not VBR", async () => {
    const result = await isVbrMp3(fixture("mobydick_001_002_melville.mp3"))
    assert.strictEqual(result, false)
  })

  it("detects a variable bitrate MP3", async () => {
    // This file reports an average per-stream bitrate via its Xing header, so
    // the previous "missing stream bitrate" heuristic misclassified it as CBR.
    const result = await isVbrMp3(fixture("sleepy_hollow_irving_vbr.mp3"))
    assert.strictEqual(result, true)
  })

  it("does not treat non-MP3 files as VBR", async () => {
    const result = await isVbrMp3(fixture("Cover.png"))
    assert.strictEqual(result, false)
  })
})
