import assert from "node:assert"
import { randomUUID } from "node:crypto"
import { mkdir, readdir } from "node:fs/promises"
import { availableParallelism } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"

import { AsyncSemaphore } from "@esfx/async-semaphore"

import { createLogger } from "../../common/logging.ts"
import { processFile } from "../processAudiobook.ts"

function createTestLogger() {
  return createLogger(process.env["CI"] ? "silent" : "info")
}

void describe("processFile", () => {
  void it("can process mpeg4 files", async () => {
    const input = join(
      "src",
      "__fixtures__",
      "mpeg4",
      "MobyDickOrTheWhalePart1_librivox.m4b",
    )

    const outDir = join("src", "__fixtures__", "__output__", randomUUID())
    await mkdir(outDir, { recursive: true })

    await processFile(input, outDir, "00000-", {
      lock: new AsyncSemaphore(availableParallelism() - 1),
      logger: createTestLogger(),
    })
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
  })

  void it("can process mp3 files", async () => {
    const input = join(
      "src",
      "__fixtures__",
      "mp3",
      "MobyDickOrTheWhalePart1_librivox.mp3",
    )
    const outDir = join("src", "__fixtures__", "__output__", randomUUID())
    await mkdir(outDir, { recursive: true })
    await processFile(input, outDir, "00000-", {
      lock: new AsyncSemaphore(availableParallelism() - 1),
      logger: createTestLogger(),
    })
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
  })

  void it("can process opus files", async () => {
    const input = join(
      "src",
      "__fixtures__",
      "opus",
      "MobyDickOrTheWhalePart1_librivox.opus",
    )
    const outDir = join("src", "__fixtures__", "__output__", randomUUID())
    await mkdir(outDir, { recursive: true })
    await processFile(input, outDir, "00000-", {
      lock: new AsyncSemaphore(availableParallelism() - 1),
      logger: createTestLogger(),
    })
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
  })

  void it("can handle nonstandard audio file", async () => {
    const input = join("src", "__fixtures__", "flac", "mobydick.flac")
    const outDir = join("src", "__fixtures__", "__output__", randomUUID())
    await mkdir(outDir, { recursive: true })
    await processFile(input, outDir, "00000-", {
      lock: new AsyncSemaphore(availableParallelism() - 1),
      logger: createTestLogger(),
    })
    const outFiles = await readdir(outDir)
    assert.deepStrictEqual(outFiles, ["00000-00001.flac"])
  })

  // This takes a long time to run
  void it("can transcode nonstandard audio file", async () => {
    const input = join("src", "__fixtures__", "flac", "mobydick.flac")
    const outDir = join("src", "__fixtures__", "__output__", randomUUID())
    await mkdir(outDir, { recursive: true })
    await processFile(input, outDir, "00000-", {
      encoding: { codec: "libopus" },
      lock: new AsyncSemaphore(availableParallelism() - 1),
      logger: createTestLogger(),
    })
    const outFiles = await readdir(outDir)
    assert.deepStrictEqual(outFiles, ["00000-00001.mp4"])
  })

  void it("can process zip files", async () => {
    const input = join("src", "__fixtures__", "zip", "moby-dick-1-7-audio.zip")
    const outDir = join("src", "__fixtures__", "__output__", randomUUID())
    await mkdir(outDir, { recursive: true })
    await processFile(input, outDir, "00000-", {
      lock: new AsyncSemaphore(availableParallelism() - 1),
      logger: createTestLogger(),
    })
    const outFiles = await readdir(outDir)
    assert.deepStrictEqual(outFiles, [
      "00000-00001.mp3",
      "00000-00002.mp3",
      "00000-00003.mp3",
    ])
  })

  void it("splits files longer than the max length", async () => {
    const input = join("src", "__fixtures__", "zip", "moby-dick-1-7-audio.zip")
    const outDir = join("src", "__fixtures__", "__output__", randomUUID())
    await mkdir(outDir, { recursive: true })
    await processFile(input, outDir, "00000-", {
      maxLength: 0.1,
      lock: new AsyncSemaphore(availableParallelism() - 1),
      logger: createTestLogger(),
    })
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
      "00000-00012.mp3",
      "00000-00013.mp3",
      "00000-00014.mp3",
      "00000-00015.mp3",
      "00000-00016.mp3",
      "00000-00017.mp3",
    ])
  })

  void it("splits files longer than the max length, even if they have chapters", async () => {
    const input = join(
      "src",
      "__fixtures__",
      "mpeg4",
      "MobyDickOrTheWhalePart1_librivox.m4b",
    )
    const outDir = join("src", "__fixtures__", "__output__", randomUUID())
    await mkdir(outDir, { recursive: true })
    await processFile(input, outDir, "00000-", {
      maxLength: 0.25,
      lock: new AsyncSemaphore(availableParallelism() - 1),
      logger: createTestLogger(),
    })
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
      "00000-00012.mp4",
      "00000-00013.mp4",
      "00000-00014.mp4",
      "00000-00015.mp4",
      "00000-00016.mp4",
      "00000-00017.mp4",
      "00000-00018.mp4",
      "00000-00019.mp4",
      "00000-00020.mp4",
      "00000-00021.mp4",
      "00000-00022.mp4",
      "00000-00023.mp4",
      "00000-00024.mp4",
      "00000-00025.mp4",
    ])
  })
})
