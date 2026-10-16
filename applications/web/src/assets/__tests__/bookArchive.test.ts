import assert from "node:assert"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type Readable } from "node:stream"

import { describe, it, onTestFinished } from "vitest"
import { fromBuffer } from "yauzl"

import { createBookArchive } from "@/assets/bookArchive"
import { type BookWithRelations } from "@/database/books"

async function collect(stream: Readable) {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer)
  }

  return Buffer.concat(chunks)
}

function entryNames(buffer: Buffer) {
  return new Promise<string[]>((resolve, reject) => {
    fromBuffer(buffer, { lazyEntries: true }, (error, zipfile) => {
      if (error) {
        reject(error)
        return
      }

      const names: string[] = []
      zipfile.on("entry", (entry: { fileName: string }) => {
        names.push(entry.fileName)
        zipfile.readEntry()
      })
      zipfile.on("end", () => {
        resolve(names)
      })
      zipfile.on("error", reject)
      zipfile.readEntry()
    })
  })
}

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "book-archive-"))
  onTestFinished(() => rm(dir, { recursive: true, force: true }))

  const ebook = join(dir, "dune.epub")
  const readaloud = join(dir, "dune-readaloud.epub")
  const audio = join(dir, "dune-audio")
  const other = join(dir, "other.epub")

  await writeFile(ebook, Buffer.alloc(3000, 1))
  await writeFile(readaloud, Buffer.alloc(5000, 2))
  await mkdir(join(audio, "disc 1"), { recursive: true })
  await writeFile(join(audio, "disc 1", "01.mp3"), Buffer.alloc(7000, 3))
  await writeFile(join(audio, "02.mp3"), Buffer.alloc(7000, 4))
  await writeFile(other, Buffer.alloc(1000, 5))

  const asset = (filepath: string) => ({ filepath, missing: false })

  return [
    {
      uuid: "a",
      title: "Dune",
      ebook: asset(ebook),
      readaloud: asset(readaloud),
      audiobook: asset(audio),
    },
    {
      uuid: "b",
      title: "Dune",
      ebook: asset(other),
      readaloud: null,
      audiobook: null,
    },
    {
      uuid: "c",
      title: "Gone",
      ebook: asset(join(dir, "missing.epub")),
      readaloud: null,
      audiobook: null,
    },
  ] as unknown as BookWithRelations[]
}

describe("createBookArchive", () => {
  it("reports the exact size of the zip it streams", async () => {
    const books = await fixture()

    const { stream, size } = await createBookArchive(books, "all", "Library")
    const buffer = await collect(stream)

    assert.strictEqual(buffer.length, size)
  })

  it("puts the readme first and lays out every format per book", async () => {
    const books = await fixture()

    const { stream, titles } = await createBookArchive(books, "all", "Library")
    const names = await entryNames(await collect(stream))

    assert.deepStrictEqual(names, [
      "README.txt",
      "Dune/Dune.epub",
      "Dune/02.mp3",
      "Dune/disc 1/01.mp3",
      "Dune/Dune (readaloud).epub",
      "Dune (2)/Dune (2).epub",
    ])
    assert.deepStrictEqual(titles, ["Dune", "Dune"])
  })

  it("keeps single ebook downloads flat", async () => {
    const books = await fixture()

    const { stream } = await createBookArchive(books, "ebook", "Library")
    const names = await entryNames(await collect(stream))

    assert.deepStrictEqual(names, ["README.txt", "Dune.epub", "Dune (2).epub"])
  })
})
