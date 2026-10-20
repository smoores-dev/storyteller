import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { cwd } from "node:process"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { Epub, MemoryAdapter } from "@storyteller-platform/epub"

import { type BookWithRelations } from "@/database/books.ts"
import { locatorFromReferences } from "@/progress/locators/fromReferences.ts"
import { locatorToCharacterCount } from "@/progress/locators/toChar.ts"
import { locatorToProgressionDocument } from "@/progress/locators/toProgressionDocument.ts"
import { resolveReferences } from "@/progress/references.ts"
import { UriReference } from "@/progress/uriReference.ts"

import {
  CHAPTER_1,
  CHAPTER_2,
  TRACK_1,
  buildAudiobook,
  buildEpub,
  makeBook,
} from "./fixtures.ts"

const TIMESTAMP = 1700000000000
const MODIFIED = "2023-11-14T22:13:20.000Z"
const DEVICE_ID = "tag:test"

const AUDIOBOOK_DIR = join(cwd(), "src/__fixtures__/books/audiobooks/moby-dick")
const MOBY_DICK_1 = "mobydick_001_002_melville.mp3"
const MOBY_DICK_2 = "mobydick_001_003_melville.mp3"

let dir!: string
let ebookPath!: string
let readaloudPath!: string
let books!: {
  /** ebook + aligned readaloud + standalone audiobook */
  all: BookWithRelations
  /** ebook only */
  ebookOnly: BookWithRelations
  /** standalone audiobook only - no text at all */
  audiobookOnly: BookWithRelations
  /** readaloud with extra ids in its text, which the overlay ignores */
  extraIds: BookWithRelations
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "storyteller-progress-locators-"))

  ebookPath = await buildEpub(join(dir, "ebook"), { name: "ebook" })
  readaloudPath = await buildEpub(join(dir, "readaloud"), {
    overlays: true,
    name: "readaloud",
  })
  const audiobook = await buildAudiobook(join(dir, "audiobook"))

  const extraIdsPath = await buildEpub(join(dir, "extra-ids"), {
    overlays: true,
    extraIds: true,
    name: "extra-ids",
  })

  books = {
    all: makeBook({ ebook: ebookPath, readaloud: readaloudPath, audiobook }),
    ebookOnly: makeBook({ ebook: ebookPath }),
    audiobookOnly: makeBook({ audiobook: AUDIOBOOK_DIR }),
    extraIds: makeBook({ readaloud: extraIdsPath }),
  }
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe("locatorToProgressionDocument", () => {
  it("uses the locator's title, total progression and timestamp", async () => {
    const result = await locatorToProgressionDocument(
      books.all,
      {
        title: "Chapter One",
        href: CHAPTER_1,
        type: "application/xhtml+xml",
        locations: { fragments: ["ch1-p2"], totalProgression: 0.25 },
      },
      TIMESTAMP,
      DEVICE_ID,
    )

    expect(result?.ebook).toEqual(
      expect.objectContaining({
        title: "Chapter One",
        modified: MODIFIED,
        device: { id: DEVICE_ID, name: "Unknown" },
        progression: 0.25,
      }),
    )
  })

  it("returns null for unresolvable locators", async () => {
    const result = await locatorToProgressionDocument(
      books.all,
      {
        title: "Chapter One",
        href: CHAPTER_1,
        type: "application/xhtml+xml",
        locations: { fragments: ["ch1-p2"] },
      },
      TIMESTAMP,
      DEVICE_ID,
    )

    expect(result?.ebook?.progression).toBe(0)
  })

  it("resolves a readaloud fragment into the other formats", async () => {
    const result = await locatorToProgressionDocument(
      books.all,
      {
        title: "Chapter One",
        href: CHAPTER_1,
        type: "application/xhtml+xml",
        locations: { fragments: ["ch1-p2"], progression: 0.5 },
      },
      TIMESTAMP,
      DEVICE_ID,
    )

    expect(result?.readaloud?.references.map((ref) => ref.href)).toContain(
      `${CHAPTER_1}#char=27`,
    )
    expect(result?.readaloud?.references.map((ref) => ref.href)).toContain(
      `${CHAPTER_1}#ch1-p2`,
    )
    expect(result?.ebook?.references.map((ref) => ref.href)).toContain(
      `${CHAPTER_1}#char=27`,
    )
  })

  it("prioritizes fragment over progression progression", async () => {
    // ch1-p1 starts at offset 11; 0.9 of the resource is far later
    const result = await locatorToProgressionDocument(
      books.all,
      {
        title: "Chapter One",
        href: CHAPTER_1,
        type: "application/xhtml+xml",
        locations: { fragments: ["ch1-p1"], progression: 0.9 },
      },
      TIMESTAMP,
      DEVICE_ID,
    )

    expect(result?.readaloud?.references.map((ref) => ref.href)).toContain(
      `${CHAPTER_1}#char=11`,
    )
  })

  it("resolves an audio locator's timestamp into the text's positions", async () => {
    const result = await locatorToProgressionDocument(
      books.all,
      {
        title: "Chapter One",
        href: TRACK_1,
        type: "audio/mpeg",
        locations: { fragments: ["t=10"], totalProgression: 0.3 },
      },
      TIMESTAMP,
      DEVICE_ID,
    )

    expect(result?.readaloud?.references.map((ref) => ref.href)).toContain(
      `${CHAPTER_1}#char=27`,
    )
    expect(result?.readaloud?.progression).toBe(0.3)
  })

  it("resolves fragments to audio timestamps", async () => {
    const result = await locatorToProgressionDocument(
      books.all,
      {
        title: "Chapter One",
        href: CHAPTER_1,
        type: "application/xhtml+xml",
        locations: { fragments: ["ch1-p2"] },
      },
      TIMESTAMP,
      DEVICE_ID,
    )

    expect(result?.audiobook?.references.map((ref) => ref.href)).toEqual([
      `${TRACK_1}#t=10`,
    ])
  })

  it("resolves an ebook locator's progression to a character offset", async () => {
    const result = await locatorToProgressionDocument(
      books.ebookOnly,
      {
        title: "Chapter One",
        href: CHAPTER_1,
        type: "application/xhtml+xml",
        locations: { progression: 0.5 },
      },
      TIMESTAMP,
      DEVICE_ID,
    )

    expect(result?.ebook?.references.map((ref) => ref.href)).toContain(
      `${CHAPTER_1}#char=27`,
    )
  })

  it("falls back to the progression when the anchor is not in the book", async () => {
    const result = await locatorToProgressionDocument(
      books.all,
      {
        title: "Chapter One",
        href: CHAPTER_1,
        type: "application/xhtml+xml",
        locations: { fragments: ["chapter-1-paragraph-2"], progression: 0.5 },
      },
      TIMESTAMP,
      DEVICE_ID,
    )

    expect(result?.readaloud?.references.map((ref) => ref.href)).toContain(
      `${CHAPTER_1}#char=27`,
    )
  })

  it("returns null for an audio locator without a timestamp", async () => {
    const result = await locatorToProgressionDocument(
      books.all,
      {
        title: "Chapter One",
        href: TRACK_1,
        type: "audio/mpeg",
        locations: { progression: 0.5 },
      },
      TIMESTAMP,
      DEVICE_ID,
    )

    expect(result).toBeNull()
  })

  it("returns null when the book has no text for an xhtml locator", async () => {
    const result = await locatorToProgressionDocument(
      books.audiobookOnly,
      {
        title: "Chapter One",
        href: CHAPTER_1,
        type: "application/xhtml+xml",
        locations: { fragments: ["ch1-p2"] },
      },
      TIMESTAMP,
      DEVICE_ID,
    )

    expect(result).toBeNull()
  })
})

describe("locatorToCharacterCount", () => {
  it("counts the characters of the locator's anchor", async () => {
    using epub = await Epub.using(MemoryAdapter).from(readaloudPath)

    const chars = await locatorToCharacterCount(
      epub,
      {
        title: "Chapter One",
        href: CHAPTER_1,
        type: "application/xhtml+xml",
        locations: { fragments: ["ch1-p2"], progression: 0.9 },
      },
      "fragments",
    )

    expect(chars).toBe(27)
  })

  it("counts half the resource as its middle character", async () => {
    using epub = await Epub.using(MemoryAdapter).from(ebookPath)

    const chars = await locatorToCharacterCount(
      epub,
      {
        title: "Chapter One",
        href: CHAPTER_1,
        type: "application/xhtml+xml",
        locations: { progression: 0.5 },
      },
      "progression",
    )

    expect(chars).toBe(27)
  })

  it("counts the first character for a progression of 0", async () => {
    using epub = await Epub.using(MemoryAdapter).from(ebookPath)

    const chars = await locatorToCharacterCount(
      epub,
      {
        title: "Chapter One",
        href: CHAPTER_1,
        type: "application/xhtml+xml",
        locations: { progression: 0 },
      },
      "progression",
    )

    expect(chars).toBe(0)
  })
})

describe("locatorFromReferences", () => {
  it("locates a character offset in its resource", async () => {
    const locator = await locatorFromReferences(books.ebookOnly, {
      ebook: [new UriReference(`${CHAPTER_1}#char=27`)],
    })

    expect(locator).toBeTruthy()
    expect(locator!.href).toBe(CHAPTER_1)
    expect(locator!.type).toBe("application/xhtml+xml")
    expect(locator!.locations!.progression).toBeCloseTo(27 / 56, 4)
    expect(locator!.locations!.totalProgression).toBeCloseTo(27 / 92, 4)
  })

  it("counts the chapters before the locator's own for the total", async () => {
    const locator = await locatorFromReferences(books.ebookOnly, {
      ebook: [new UriReference(`${CHAPTER_2}#char=11`)],
    })

    expect(locator!.locations!.totalProgression).toBeCloseTo(67 / 92, 4)
  })

  it("produces a valid CSS selector", async () => {
    const first = (await locatorFromReferences(books.ebookOnly, {
      ebook: [new UriReference(`${CHAPTER_1}#char=0`)],
    }))!.locations!.cssSelector

    const second = (await locatorFromReferences(books.ebookOnly, {
      ebook: [new UriReference(`${CHAPTER_1}#char=27`)],
    }))!.locations!.cssSelector

    expect(first).toBe(":nth-child(2) > :nth-child(1)")
    expect(second).toBe(":nth-child(2) > :nth-child(3)")
  })

  it("does not resolve fragments if readaloud is unavailable", async () => {
    const locator = await locatorFromReferences(books.ebookOnly, {
      ebook: [new UriReference(`${CHAPTER_1}#char=27`)],
    })

    expect(locator!.locations!.fragments).toBeUndefined()
  })

  it("resolves fragments for books with readalouds", async () => {
    const locator = await locatorFromReferences(books.all, {
      readaloud: [new UriReference(`${CHAPTER_1}#char=27`)],
    })

    expect(locator!.locations!.fragments).toEqual(["ch1-p2"])
  })

  it("returns null for a text position the readaloud has no anchor for", async () => {
    // the nearest anchor is inside the title, which the media overlay never
    // covers, so a reader here has no readaloud position to sync to
    expect(
      await locatorFromReferences(books.all, {
        readaloud: [new UriReference(`${CHAPTER_1}#char=5`)],
      }),
    ).toBeNull()
  })

  it("resolves fragments based on media overlays", async () => {
    // skips the <em id="ch1-em"> because it's not in the media overlay
    const locator = await locatorFromReferences(books.extraIds, {
      readaloud: [new UriReference(`${CHAPTER_1}#char=50`)],
    })

    expect(locator!.locations!.fragments).toEqual(["ch1-p2"])
  })

  it("returns null for a book with neither text nor audio", async () => {
    const locator = await locatorFromReferences(makeBook({}), {
      ebook: [new UriReference(`${CHAPTER_1}#char=27`)],
    })

    expect(locator).toBeNull()
  })

  it("locates a timestamp in an audiobook with no text", async () => {
    const locator = await locatorFromReferences(books.audiobookOnly, {
      audiobook: [new UriReference(`${MOBY_DICK_1}#t=30`)],
    })

    expect(locator!.href).toBe(MOBY_DICK_1)
    expect(locator!.type).toBe("audio/mpeg")
    expect(locator!.locations!.fragments).toEqual(["t=30"])
    expect(locator!.locations!.progression).toBeLessThan(0.05)
    expect(locator!.locations!.totalProgression).toBeLessThan(0.05)
  })

  it("counts the duration of the files before the one it is in", async () => {
    const locator = await locatorFromReferences(books.audiobookOnly, {
      audiobook: [new UriReference(`${MOBY_DICK_2}#t=5`)],
    })

    expect(locator!.locations!.progression).toBeLessThan(0.05)
    expect(locator!.locations!.totalProgression).toBeGreaterThan(0.5)
  })

  it("returns null for a timestamp in a file the audiobook does not have", async () => {
    const locator = await locatorFromReferences(books.audiobookOnly, {
      audiobook: [new UriReference("not-in-the-book.mp3#t=5")],
    })

    expect(locator).toBeNull()
  })

  it("round trips a readaloud position through the resolver", async () => {
    const references = await resolveReferences(books.all, "readaloud", [
      `${CHAPTER_1}#char=27`,
    ])

    const locator = await locatorFromReferences(books.all, references)
    expect(locator).toBeTruthy()

    const converted = await locatorToProgressionDocument(
      books.all,
      locator!,
      TIMESTAMP,
      DEVICE_ID,
    )

    expect(converted?.readaloud?.references.map((ref) => ref.href)).toContain(
      `${CHAPTER_1}#char=27`,
    )
  })
})
