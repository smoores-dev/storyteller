import { describe, it } from "node:test"
import { getTrackDuration } from "../audio"
import { join } from "node:path"
import assert from "node:assert"

describe("getTrackInfo", () => {
  it("can get track duration from an mp3 file", async () => {
    const duration = await getTrackDuration(
      join("__fixtures__", "mobydick_001_002_melville.mp3"),
    )
    assert.strictEqual(duration, 1436.638188)
  })

  it("can get track info from an mp4 file", async () => {
    const duration = await getTrackDuration(
      join("__fixtures__", "MobyDickOrTheWhalePart1_librivox.m4b"),
    )
    assert.strictEqual(duration, 18742.715)
  })
})
