import assert from "node:assert"
import { copyFile, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { cwd } from "node:process"

import { afterEach, describe, it } from "vitest"

import { Audiobook } from "@storyteller-platform/audiobook"

import {
  getMetadataFromAudiobook,
  writeMetadataToAudiobook,
} from "@/assets/metadata"
import { type BookWithRelations } from "@/database/books"

const TRACK = join(
  cwd(),
  "src/__fixtures__/books/audiobooks/moby-dick/mobydick_001_002_melville.mp3",
)

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((dir) => rm(dir, { recursive: true })),
  )
})

async function audiobookDirectory() {
  const dir = await mkdtemp(join(tmpdir(), "storyteller-release-date-"))
  directories.push(dir)
  await copyFile(TRACK, join(dir, "mobydick_001_002_melville.mp3"))
  return dir
}

function makeBook(directory: string, releaseDate: string | null) {
  return {
    uuid: "00000000-0000-0000-0000-000000000000",
    title: "Moby Dick",
    subtitle: null,
    description: "Recorded by Stewart Wills",
    releaseDate,
    authors: [{ name: "Herman Melville" }],
    narrators: [],
    audiobook: { filepath: directory },
  } as unknown as BookWithRelations
}

async function readReleaseDate(directory: string) {
  using audiobook = await Audiobook.from(
    join(directory, "mobydick_001_002_melville.mp3"),
  )
  const { update } = await getMetadataFromAudiobook(audiobook)
  return update?.releaseDate
}

describe("audiobook release date", () => {
  it("is written to the audiobook files and read back", async () => {
    const directory = await audiobookDirectory()

    assert.strictEqual(await readReleaseDate(directory), undefined)

    await writeMetadataToAudiobook(
      makeBook(directory, "2007-03-14T00:00:00.000Z"),
    )
    assert.strictEqual(
      await readReleaseDate(directory),
      "2007-03-14T00:00:00.000Z",
    )

    await writeMetadataToAudiobook(
      makeBook(directory, "2011-05-01T00:00:00.000Z"),
    )
    assert.strictEqual(
      await readReleaseDate(directory),
      "2011-05-01T00:00:00.000Z",
    )
  })
})
