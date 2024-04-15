import { describe, it } from "node:test"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import {
  getAudioCoverFilepath,
  getProcessedAudioFilepath,
  processFile,
} from "../processAudio"
import { mkdir, readdir } from "node:fs/promises"
import assert from "node:assert"

void describe("processFile", () => {
  void it("can process mpeg4 files", async () => {
    const input = join("__fixtures__", "MobyDickOrTheWhalePart1_librivox.m4b")
    const uuid = randomUUID()
    const outDir = getProcessedAudioFilepath(uuid)
    await mkdir(outDir, { recursive: true })
    await processFile(uuid, input, outDir)
    const outFiles = await readdir(outDir)
    assert.deepStrictEqual(outFiles, [
      "00001.mp4",
      "00002.mp4",
      "00003.mp4",
      "00004.mp4",
      "00005.mp4",
      "00006.mp4",
      "00007.mp4",
      "00008.mp4",
      "00009.mp4",
      "00010.mp4",
      "00011.mp4",
    ])
    const audioCover = await getAudioCoverFilepath(uuid)
    assert.ok(audioCover!.endsWith("Audio Cover.png"))
  })

  void it("can process zip files", async () => {
    const input = join("__fixtures__", "moby-dick-1-7-audio.zip")
    const uuid = randomUUID()
    const outDir = getProcessedAudioFilepath(uuid)
    await mkdir(outDir, { recursive: true })
    await processFile(uuid, input, outDir)
    const outFiles = await readdir(outDir)
    assert.deepStrictEqual(outFiles, [
      "mobydick_001_002_melville.mp3",
      "mobydick_003_melville.mp3",
      "mobydick_004_007_melville.mp3",
    ])
  })
})
