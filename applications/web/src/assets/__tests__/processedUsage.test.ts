import assert from "node:assert"
import { randomUUID } from "node:crypto"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { describe, it, onTestFinished } from "vitest"

import { seedBooks, setupTestDb } from "@/__tests__/harness/testDb"
import { getProcessedUsage } from "@/assets/fs"
import {
  getEmissionsFilepath,
  getInternalBookDirectory,
  getProcessedAudioFilepath,
  getTranscriptionsFilepath,
} from "@/assets/paths"
import { getBook } from "@/database/books"
import { type UUID } from "@/uuid"

describe("getProcessedUsage", () => {
  it("is zero for a book that was never processed", async () => {
    using _db = setupTestDb()

    const [uuid] = seedBooks(_db, [{ title: randomUUID() }])
    const book = await getBook(uuid as UUID)
    assert.ok(book)

    assert.deepStrictEqual(await getProcessedUsage(book), {
      transcodedAudio: 0,
      transcriptions: 0,
      emissions: 0,
    })
  })

  it("measures processed audio, transcriptions and emissions only", async () => {
    using _db = setupTestDb()

    const [uuid] = seedBooks(_db, [{ title: randomUUID() }])
    const book = await getBook(uuid as UUID)
    assert.ok(book)
    onTestFinished(() =>
      rm(getInternalBookDirectory(book), { recursive: true, force: true }),
    )

    const chapterDir = getProcessedAudioFilepath(book, "part 1")
    await mkdir(chapterDir, { recursive: true })
    await writeFile(join(chapterDir, "00001.mp4"), Buffer.alloc(300))
    await mkdir(getTranscriptionsFilepath(book), { recursive: true })
    await writeFile(
      getTranscriptionsFilepath(book, "00001.json"),
      "x".repeat(40),
    )
    await mkdir(getEmissionsFilepath(book), { recursive: true })
    await writeFile(getEmissionsFilepath(book, "00001.bin"), Buffer.alloc(7))
    await writeFile(
      join(getInternalBookDirectory(book), "cover.jpg"),
      Buffer.alloc(1000),
    )

    assert.deepStrictEqual(await getProcessedUsage(book), {
      transcodedAudio: 300,
      transcriptions: 40,
      emissions: 7,
    })
  })
})
