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
    await processFile(uuid, input, outDir, "00000-", null, null, null)
    const outFiles = await readdir(outDir)
    assert.deepStrictEqual(outFiles, [
      "00000-00001.mp4",
      "00000-00002.mp4",
      "00000-00003.mp4",
      "00000-00004.mp4",
      "00000-00005.mp4",
      "00000-00006.mp4",
      "00000-00007.mp4",
      "00000-00008.mp4",
      "00000-00009.mp4",
      "00000-00010.mp4",
      "00000-00011.mp4",
    ])
    const audioCover = await getAudioCoverFilepath(uuid)
    assert.ok(audioCover!.endsWith("Audio Cover.png"))
  })

  void it("can process mp3 files", async () => {
    const input = join("__fixtures__", "MobyDickOrTheWhalePart1_librivox.mp3")
    const uuid = randomUUID()
    const outDir = getProcessedAudioFilepath(uuid)
    await mkdir(outDir, { recursive: true })
    await processFile(uuid, input, outDir, "00000-", null, null, null)
    const outFiles = await readdir(outDir)
    assert.deepStrictEqual(outFiles, [
      "00000-00001.mp3",
      "00000-00002.mp3",
      "00000-00003.mp3",
      "00000-00004.mp3",
      "00000-00005.mp3",
      "00000-00006.mp3",
      "00000-00007.mp3",
      "00000-00008.mp3",
      "00000-00009.mp3",
      "00000-00010.mp3",
      "00000-00011.mp3",
    ])
    const audioCover = await getAudioCoverFilepath(uuid)
    assert.ok(audioCover!.endsWith("Audio Cover.png"))
  })

  void it("can process zip files", async () => {
    const input = join("__fixtures__", "moby-dick-1-7-audio.zip")
    const uuid = randomUUID()
    const outDir = getProcessedAudioFilepath(uuid)
    await mkdir(outDir, { recursive: true })
    await processFile(uuid, input, outDir, "00000-", null, null, null)
    const outFiles = await readdir(outDir)
    assert.deepStrictEqual(outFiles, [
      "00000-00000-00001.mp3",
      "00000-00001-00001.mp3",
      "00000-00002-00001.mp3",
    ])
  })
})
