import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { type BookWithRelations } from "@/database/books.ts"
import { CACHE_DIR } from "@/directories.ts"
import { getOverlayIndex } from "@/progress/mediaOverlays.ts"
import {
  isOverlayAnchor,
  overlayAudioFiles,
  resolveAnchorToTimestamp,
  resolveTimestampToAnchor,
  type OverlayIndex,
} from "@/progress/overlayIndex.ts"
import { UriReference } from "@/progress/uriReference.ts"

import {
  AUDIO_1,
  AUDIO_2,
  CHAPTER_1,
  CHAPTER_2,
  buildEpub,
  makeBook,
} from "./fixtures.ts"

/** Where persisted overlay indexes are kept. */
const OVERLAYS_DIR = join(CACHE_DIR, "overlays")

function audio(resource: string, seconds: number): UriReference {
  return new UriReference(`${resource}#t=${seconds}`)
}

function anchored(resource: string, id: string): UriReference {
  return new UriReference(`${resource}#${id}`)
}

/** The files an index for this readaloud has been persisted to. */
async function cacheFilesOf(book: BookWithRelations): Promise<string[]> {
  const files = await readdir(OVERLAYS_DIR).catch(() => [] as string[])

  return files.filter((file) =>
    file.startsWith(`${book.readaloud?.uuid ?? "never"}-`),
  )
}

let dir!: string
let readaloud!: string
let unoverlaidReadaloud!: string
let overlays!: OverlayIndex
let unoverlaidOverlays!: OverlayIndex
let gappedOverlays!: OverlayIndex
let book!: BookWithRelations
let unoverlaidBook!: BookWithRelations
let gappedBook!: BookWithRelations
let ebookOnlyBook!: BookWithRelations

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "storyteller-progress-overlays-"))

  readaloud = await buildEpub(join(dir, "readaloud"), {
    overlays: true,
    name: "readaloud",
  })
  unoverlaidReadaloud = await buildEpub(join(dir, "unoverlaid"), {
    overlays: true,
    extraIds: true,
    name: "unoverlaid",
  })
  const ebook = await buildEpub(join(dir, "ebook"), { name: "ebook" })

  book = makeBook({ readaloud })
  unoverlaidBook = makeBook({ readaloud: unoverlaidReadaloud })
  gappedBook = makeBook({
    readaloud: await buildEpub(join(dir, "gapped"), {
      overlays: true,
      gaps: true,
      name: "gapped",
    }),
  })
  ebookOnlyBook = makeBook({ ebook })

  const index = await getOverlayIndex(book)
  expect(index).toBeTruthy()
  overlays = index!

  const unoverlaid = await getOverlayIndex(unoverlaidBook)
  expect(unoverlaid).toBeTruthy()
  unoverlaidOverlays = unoverlaid!

  const gapped = await getOverlayIndex(gappedBook)
  expect(gapped).toBeTruthy()
  gappedOverlays = gapped!
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })

  for (const each of [book, unoverlaidBook, gappedBook]) {
    for (const file of await cacheFilesOf(each)) {
      await rm(join(OVERLAYS_DIR, file), { force: true })
    }
  }
})

describe("media overlays", () => {
  describe("from a timestamp", () => {
    it("resolves the anchor of the paragraph the timestamp falls in", () => {
      expect(resolveTimestampToAnchor(overlays, audio(AUDIO_1, 12))).toBe(
        `${CHAPTER_1}#ch1-p2`,
      )
    })

    it("resolves the anchor at the start of a paragraph", () => {
      expect(resolveTimestampToAnchor(overlays, audio(AUDIO_1, 10))).toBe(
        `${CHAPTER_1}#ch1-p2`,
      )
    })

    it("resolves the anchor of a paragraph in another audio file", () => {
      // each file's overlay clips start at the front of that file
      expect(resolveTimestampToAnchor(overlays, audio(AUDIO_2, 5))).toBe(
        `${CHAPTER_2}#ch2-p1`,
      )
    })

    it("resolves the last paragraph right to the end of its file", () => {
      expect(resolveTimestampToAnchor(overlays, audio(AUDIO_1, 19.999))).toBe(
        `${CHAPTER_1}#ch1-p2`,
      )
    })

    it("returns null for a timestamp the overlays do not cover", () => {
      expect(resolveTimestampToAnchor(overlays, audio(AUDIO_1, 99))).toBeNull()
    })
  })

  describe("timestamps and the gaps between clips", () => {
    it("resolves a timestamp between two clips to the one before it", () => {
      // chapter one's first clip ends at 9s and the next starts at 12s
      expect(
        resolveTimestampToAnchor(gappedOverlays, audio(AUDIO_1, 9.5)),
      ).toBe(`${CHAPTER_1}#ch1-p1`)
    })

    it("resolves a timestamp at the start of a clip to that clip", () => {
      // the clip after this one starts at 18s, and a timestamp before the
      // start of a clip is still the clip it is inside
      expect(resolveTimestampToAnchor(gappedOverlays, audio(AUDIO_1, 12))).toBe(
        `${CHAPTER_1}#ch1-p2`,
      )
    })

    it("resolves a timestamp of the last clip of a file", () => {
      expect(resolveTimestampToAnchor(gappedOverlays, audio(AUDIO_1, 19))).toBe(
        `${CHAPTER_1}#ch1-p1`,
      )
    })

    it("returns null for a timestamp before the first clip of a file", () => {
      // chapter two's only clip starts at 3s
      expect(
        resolveTimestampToAnchor(gappedOverlays, audio(AUDIO_2, 2)),
      ).toBeNull()
    })

    it("returns null for a timestamp past the last clip of a file", () => {
      expect(
        resolveTimestampToAnchor(gappedOverlays, audio(AUDIO_1, 20)),
      ).toBeNull()
    })
  })

  describe("from an anchor", () => {
    it("resolves the audio range that covers the paragraph", () => {
      expect(
        resolveAnchorToTimestamp(overlays, anchored(CHAPTER_1, "ch1-p1")),
      ).toBe(`${AUDIO_1}#t=0,10`)
    })

    it("resolves the audio range of a paragraph in another chapter", () => {
      expect(
        resolveAnchorToTimestamp(overlays, anchored(CHAPTER_2, "ch2-p1")),
      ).toBe(`${AUDIO_2}#t=0,10`)
    })

    it("returns null for an anchor the overlays do not cover", () => {
      expect(
        resolveAnchorToTimestamp(overlays, anchored(CHAPTER_1, "ch1-title")),
      ).toBeNull()
    })
  })

  describe("anchor candidates", () => {
    it("knows the anchors of the paragraphs the overlays cover", () => {
      expect(isOverlayAnchor(overlays, CHAPTER_1, "ch1-p1")).toBe(true)
      expect(isOverlayAnchor(overlays, CHAPTER_1, "ch1-p2")).toBe(true)
    })

    it("leaves out ids the media overlays never reference", () => {
      // the h1 has an id, and so do an em and a paragraph of another book,
      // but no par points at any of them
      expect(isOverlayAnchor(overlays, CHAPTER_1, "ch1-title")).toBe(false)
      expect(isOverlayAnchor(unoverlaidOverlays, CHAPTER_1, "ch1-em")).toBe(
        false,
      )
      expect(isOverlayAnchor(unoverlaidOverlays, CHAPTER_1, "ch1-note")).toBe(
        false,
      )
    })

    it("only knows anchors of the requested chapter", () => {
      expect(isOverlayAnchor(overlays, CHAPTER_2, "ch2-p1")).toBe(true)
      expect(isOverlayAnchor(overlays, CHAPTER_2, "ch1-p1")).toBe(false)
      expect(isOverlayAnchor(overlays, CHAPTER_1, "ch2-p1")).toBe(false)
    })
  })

  describe("audio files", () => {
    it("lists the audio files the overlays use", () => {
      expect([...overlayAudioFiles(overlays)].sort()).toEqual([
        AUDIO_1,
        AUDIO_2,
      ])
    })
  })

  describe("persisting an index", () => {
    it("writes one file per readaloud", async () => {
      expect(await cacheFilesOf(book)).toHaveLength(1)
    })

    it("answers the same from the persisted index", async () => {
      const again = await getOverlayIndex(book)
      expect(again).toBeTruthy()

      expect(resolveTimestampToAnchor(again!, audio(AUDIO_1, 12))).toBe(
        `${CHAPTER_1}#ch1-p2`,
      )
      expect(isOverlayAnchor(again!, CHAPTER_1, "ch1-p2")).toBe(true)
    })

    it("builds again for a readaloud that has changed", async () => {
      const changed = {
        ...book,
        readaloud: {
          // oxlint-disable-next-line typescript/no-non-null-assertion
          ...book.readaloud!,
          fingerprint: "a-new-fingerprint",
        },
      } as BookWithRelations

      const index = await getOverlayIndex(changed)

      expect(resolveTimestampToAnchor(index!, audio(AUDIO_1, 12))).toBe(
        `${CHAPTER_1}#ch1-p2`,
      )
      // the index of the previous fingerprint is gone
      expect(await cacheFilesOf(changed)).toHaveLength(1)

      await rm(join(OVERLAYS_DIR, (await cacheFilesOf(changed))[0]!), {
        force: true,
      })
    })

    it("builds again when the persisted index cannot be read", async () => {
      const [file] = await cacheFilesOf(unoverlaidBook)
      expect(file).toBeTruthy()

      await writeFile(join(OVERLAYS_DIR, file!), "not an index")

      const index = await getOverlayIndex(unoverlaidBook)

      expect(isOverlayAnchor(index!, CHAPTER_1, "ch1-p1")).toBe(true)
    })
  })

  it("has no guided navigation for a book without a readaloud", async () => {
    expect(await getOverlayIndex(ebookOnlyBook)).toBeNull()
  })
})
