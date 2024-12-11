import { describe, it } from "node:test"
import { getTrackDuration } from "../audio"
import { join } from "node:path"
import assert from "node:assert"

void describe("getTrackInfo", () => {
  void it("can get track duration from an mp3 file", async () => {
    const duration = await getTrackDuration(
      join("src", "__fixtures__", "mobydick_001_002_melville.mp3"),
    )
    assert.strictEqual(Math.floor(duration), 1436)
  })

  void it("can get track info from an mp4 file", async () => {
    const duration = await getTrackDuration(
      join("src", "__fixtures__", "MobyDickOrTheWhalePart1_librivox.m4b"),
    )
    assert.strictEqual(Math.floor(duration), 18742)
  })
})
