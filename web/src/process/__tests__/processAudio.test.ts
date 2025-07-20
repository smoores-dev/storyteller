import { describe, it } from "node:test"
import { dirname, join } from "node:path"
import { randomUUID } from "node:crypto"
import { processFile } from "../processAudio"
import { mkdir, readdir } from "node:fs/promises"
import assert from "node:assert"
import { getProcessedAudioFilepath, shortenUuid } from "@/assets/paths"
import { getAudioCoverFilepath } from "@/assets/covers"
import { AsyncSemaphore } from "@esfx/async-semaphore"
import { BookWithRelations } from "@/database/books"
import { availableParallelism } from "node:os"

void describe("processFile", () => {
  void it("can process mpeg4 files", async () => {
    const input = join(
      "src",
      "__fixtures__",
      "mpeg4",
      "MobyDickOrTheWhalePart1_librivox.m4b",
    )
    const uuid = randomUUID()
    const book = {
      uuid: uuid,
      title: "Moby Dick",
      suffix: ` [${shortenUuid(uuid)}]`,
      audiobook: {
        filepath: dirname(input),
      },
    } as BookWithRelations
    const outDir = getProcessedAudioFilepath(book)
    await mkdir(outDir, { recursive: true })
    await processFile(
      book,
      input,
      outDir,
      "00000-",
      null,
      null,
      null,
      new AsyncSemaphore(availableParallelism() - 1),
    )
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
    const uuid = randomUUID()
    const book = {
      uuid: uuid,
      title: "Moby Dick",
      suffix: ` [${shortenUuid(uuid)}]`,
      audiobook: {
        filepath: dirname(input),
      },
    } as BookWithRelations
    const outDir = getProcessedAudioFilepath(book)
    await mkdir(outDir, { recursive: true })
    await processFile(
      book,
      input,
      outDir,
      "00000-",
      null,
      null,
      null,
      new AsyncSemaphore(availableParallelism() - 1),
    )
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
    const uuid = randomUUID()
    const book = {
      uuid: uuid,
      title: "Moby Dick",
      suffix: ` [${shortenUuid(uuid)}]`,
      audiobook: {
        filepath: dirname(input),
      },
    } as BookWithRelations
    const outDir = getProcessedAudioFilepath(book)
    await mkdir(outDir, { recursive: true })
    await processFile(
      book,
      input,
      outDir,
      "00000-",
      null,
      null,
      null,
      new AsyncSemaphore(availableParallelism() - 1),
    )
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
    const uuid = randomUUID()
    const book = {
      uuid: uuid,
      title: "Moby Dick",
      suffix: ` [${shortenUuid(uuid)}]`,
      audiobook: {
        filepath: dirname(input),
      },
    } as BookWithRelations
    const outDir = getProcessedAudioFilepath(book)
    await mkdir(outDir, { recursive: true })
    await processFile(
      book,
      input,
      outDir,
      "00000-",
      null,
      null,
      null,
      new AsyncSemaphore(availableParallelism() - 1),
    )
    const outFiles = await readdir(outDir)
    assert.deepStrictEqual(outFiles, ["00000-00001.flac"])
  })

  // This takes a long time to run
  void it.skip("can transcode nonstandard audio file", async () => {
    const input = join("src", "__fixtures__", "flac", "mobydick.flac")
    const uuid = randomUUID()
    const book = {
      uuid: uuid,
      title: "Moby Dick",
      suffix: ` [${shortenUuid(uuid)}]`,
      audiobook: {
        filepath: dirname(input),
      },
    } as BookWithRelations
    const outDir = getProcessedAudioFilepath(book)
    await mkdir(outDir, { recursive: true })
    await processFile(
      book,
      input,
      outDir,
      "00000-",
      null,
      "libopus",
      null,
      new AsyncSemaphore(availableParallelism() - 1),
    )
    const outFiles = await readdir(outDir)
    assert.deepStrictEqual(outFiles, ["00000-00001.mp4"])
  })

  void it("can process zip files", async () => {
    const input = join("src", "__fixtures__", "zip", "moby-dick-1-7-audio.zip")
    const uuid = randomUUID()
    const book = {
      uuid: uuid,
      title: "Moby Dick",
      suffix: ` [${shortenUuid(uuid)}]`,
      audiobook: {
        filepath: dirname(input),
      },
    } as BookWithRelations
    const outDir = getProcessedAudioFilepath(book)
    await mkdir(outDir, { recursive: true })
    await processFile(
      book,
      input,
      outDir,
      "00000-",
      null,
      null,
      null,
      new AsyncSemaphore(availableParallelism() - 1),
    )
    const outFiles = await readdir(outDir)
    assert.deepStrictEqual(outFiles, [
      "00000-00000-00001.mp3",
      "00000-00001-00001.mp3",
      "00000-00002-00001.mp3",
    ])
  })

  void it("can process cover image", async () => {
    const input = join("src", "__fixtures__", "mp3", "Cover.png")
    const uuid = randomUUID()
    const book = {
      uuid: uuid,
      title: "Moby Dick",
      suffix: ` [${shortenUuid(uuid)}]`,
      audiobook: {
        filepath: dirname(input),
      },
    } as BookWithRelations
    const outDir = getProcessedAudioFilepath(book)
    await mkdir(outDir, { recursive: true })
    await processFile(
      book,
      input,
      outDir,
      "00000-",
      null,
      "libopus",
      null,
      new AsyncSemaphore(availableParallelism() - 1),
    )
    const outFiles = await readdir(outDir)
    assert.deepStrictEqual(outFiles, [])
    const audioCover = await getAudioCoverFilepath(book)
    assert.ok(audioCover!.endsWith("Cover.png"))
  })

  void it("ignores unrecognized file", async () => {
    const input = join(
      "src",
      "__fixtures__",
      "transcriptions",
      "mobydick_001_002_melville.json",
    )
    const uuid = randomUUID()
    const book = {
      uuid: uuid,
      title: "Moby Dick",
      suffix: ` [${shortenUuid(uuid)}]`,
      audiobook: {
        filepath: dirname(input),
      },
    } as BookWithRelations
    const outDir = getProcessedAudioFilepath(book)
    await mkdir(outDir, { recursive: true })
    await processFile(
      book,
      input,
      outDir,
      "00000-",
      null,
      null,
      null,
      new AsyncSemaphore(availableParallelism() - 1),
    )
    const outFiles = await readdir(outDir)
    assert.deepStrictEqual(outFiles, [])
    const audioCover = await getAudioCoverFilepath(book)
    assert.ok(audioCover === null)
  })

  void it("splits files longer than the max length", async () => {
    const input = join("src", "__fixtures__", "zip", "moby-dick-1-7-audio.zip")
    const uuid = randomUUID()
    const book = {
      uuid: uuid,
      title: "Moby Dick",
      suffix: ` [${shortenUuid(uuid)}]`,
      audiobook: {
        filepath: dirname(input),
      },
    } as BookWithRelations
    const outDir = getProcessedAudioFilepath(book)
    await mkdir(outDir, { recursive: true })
    await processFile(
      book,
      input,
      outDir,
      "00000-",
      0.1,
      null,
      null,
      new AsyncSemaphore(availableParallelism() - 1),
    )
    const outFiles = await readdir(outDir)
    assert.deepStrictEqual(outFiles, [
      "00000-00000-00001.mp3",
      "00000-00000-00002.mp3",
      "00000-00000-00003.mp3",
      "00000-00000-00004.mp3",
      "00000-00001-00001.mp3",
      "00000-00001-00002.mp3",
      "00000-00001-00003.mp3",
      "00000-00001-00004.mp3",
      "00000-00001-00005.mp3",
      "00000-00001-00006.mp3",
      "00000-00002-00001.mp3",
      "00000-00002-00002.mp3",
      "00000-00002-00003.mp3",
      "00000-00002-00004.mp3",
      "00000-00002-00005.mp3",
    ])
  })

  void it("splits files longer than the max length, even if they have chapters", async () => {
    const input = join(
      "src",
      "__fixtures__",
      "mpeg4",
      "MobyDickOrTheWhalePart1_librivox.m4b",
    )
    const uuid = randomUUID()
    const book = {
      uuid: uuid,
      title: "Moby Dick",
      suffix: ` [${shortenUuid(uuid)}]`,
      audiobook: {
        filepath: dirname(input),
      },
    } as BookWithRelations
    const outDir = getProcessedAudioFilepath(book)
    await mkdir(outDir, { recursive: true })
    await processFile(
      book,
      input,
      outDir,
      "00000-",
      0.25,
      null,
      null,
      new AsyncSemaphore(availableParallelism() - 1),
    )
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
