import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { type BookWithRelations } from "@/database/books.ts"
import { readaloudToStandaloneAudioReference } from "@/progress/audio/readaloudToStandalone.ts"
import { standaloneToReadaloudAudioReference } from "@/progress/audio/standaloneToReadaloud.ts"
import { resolveReferences } from "@/progress/references.ts"
import { UriReference } from "@/progress/uriReference.ts"

import {
  AUDIO_1,
  AUDIO_2,
  CHAPTER_1,
  CHAPTER_2,
  TRACK_1,
  TRACK_2,
  TRACK_3,
  buildAudiobook,
  buildEpub,
  makeBook,
  refStrings,
} from "./fixtures.ts"

type Format = "ebook" | "audiobook" | "readaloud"

/** A track name that cannot appear in a reference as it is on disk. */
const ENCODED_TRACK = "01 - Ishmael & Queequeg.mp3"

let dir!: string
let books!: {
  all: BookWithRelations
  extraIds: BookWithRelations
  ebookOnly: BookWithRelations
  unaligned: BookWithRelations
  audiobookOnly: BookWithRelations
  /** the readaloud, paired with a recording of another length altogether */
  mismatchedAudio: BookWithRelations
  /** the readaloud, paired with a track whose name needs encoding */
  encodedAudio: BookWithRelations
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "storyteller-progress-references-"))

  const ebook = await buildEpub(join(dir, "ebook"), { name: "ebook" })
  const readaloud = await buildEpub(join(dir, "readaloud"), {
    overlays: true,
    name: "readaloud",
  })
  const extraIdsEbook = await buildEpub(join(dir, "ebook-unoverlaid"), {
    name: "ebook-unoverlaid",
    extraIds: true,
  })
  const extraIdsReadaloud = await buildEpub(join(dir, "readaloud-unoverlaid"), {
    overlays: true,
    extraIds: true,
    name: "readaloud-unoverlaid",
  })
  const audiobook = await buildAudiobook(join(dir, "audiobook"))
  const longAudiobook = await buildAudiobook(join(dir, "audiobook-long"), [
    ["one.mp3", 20],
    ["two.mp3", 20],
  ])
  const encodedAudiobook = await buildAudiobook(
    join(dir, "audiobook-encoded"),
    [[ENCODED_TRACK, 30]],
  )

  books = {
    all: makeBook({ ebook, readaloud, audiobook }),
    mismatchedAudio: makeBook({ readaloud, audiobook: longAudiobook }),
    encodedAudio: makeBook({ readaloud, audiobook: encodedAudiobook }),
    extraIds: makeBook({
      ebook: extraIdsEbook,
      readaloud: extraIdsReadaloud,
      audiobook,
    }),
    ebookOnly: makeBook({ ebook }),
    unaligned: makeBook({ ebook, readaloud, readaloudStatus: "TRANSCRIBING" }),
    audiobookOnly: makeBook({ audiobook }),
  }
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

/** The fragment string of the first reference of `kind` in `format`. */
function fragment(
  result: Partial<Record<Format, UriReference[]>>,
  format: Format,
  kind: "media" | "epubcfi" | "crengine" | "anchor" | "char",
): string | undefined {
  return result[format]
    ?.find((ref) => ref.fragmentKind === kind)
    ?.fragment.toString()
}

/** The resource path of the first reference of `kind` in `format`. */
function path(
  result: Partial<Record<Format, UriReference[]>>,
  format: Format,
  kind: "media" | "epubcfi" | "crengine" | "anchor" | "char",
): string | undefined {
  return result[format]?.find((ref) => ref.fragmentKind === kind)?.hrefPathname
}

describe("resolveReferences", () => {
  describe("from a character offset", () => {
    it("adds the anchor of the element the offset falls in", async () => {
      const result = await resolveReferences(books.all, "ebook", [
        `${CHAPTER_1}#char=15`,
      ])

      expect(fragment(result, "ebook", "anchor")).toBe("#ch1-p1")
    })

    it("adds every other fragment type to the requested format", async () => {
      const result = await resolveReferences(books.all, "ebook", [
        `${CHAPTER_1}#char=15`,
      ])

      const refs = refStrings(result.ebook)

      expect(refs?.length).toBe(4)
      expect(refs?.includes(`${CHAPTER_1}#char=15`)).toBeTruthy()
      expect(refs?.includes(`${CHAPTER_1}#ch1-p1`)).toBeTruthy()
      expect(fragment(result, "ebook", "crengine") ?? "").toMatch(
        /\/p\[1\]\/text\(\)\[1\]\.4\)$/,
      )
      expect(fragment(result, "ebook", "epubcfi") ?? "").toMatch(
        /\/4\[ch1-p1\]\/1:4\)$/,
      )
    })

    it("adds the character offset to every other format", async () => {
      const result = await resolveReferences(books.all, "ebook", [
        `${CHAPTER_1}#char=15`,
      ])

      expect(fragment(result, "readaloud", "char")).toBe("#char=15")
    })

    it("resolves the readaloud formats to the matching audio position", async () => {
      const result = await resolveReferences(books.all, "ebook", [
        `${CHAPTER_1}#char=15`,
      ])

      expect(fragment(result, "readaloud", "media")).toBe("#t=0")
      expect(fragment(result, "audiobook", "media")).toBe("#t=0")
      // the standalone book's own file, not the one inside the epub
      expect(path(result, "audiobook", "media")).toBe(TRACK_1)
    })

    it("resolves the offset of a readaloud request", async () => {
      const result = await resolveReferences(books.all, "readaloud", [
        `${CHAPTER_1}#char=27`,
      ])

      expect(fragment(result, "readaloud", "char")).toBe("#char=27")
      expect(fragment(result, "readaloud", "anchor")).toBe("#ch1-p2")
      expect(fragment(result, "ebook", "char")).toBe("#char=27")
      expect(fragment(result, "ebook", "anchor")).toBe("#ch1-p2")
      expect(fragment(result, "readaloud", "media")).toBe("#t=10")
    })

    it("resolves a position at the start of the document", async () => {
      const result = await resolveReferences(books.all, "ebook", [
        `${CHAPTER_1}#char=0`,
      ])

      expect(fragment(result, "ebook", "char")).toBe("#char=0")
      expect(fragment(result, "ebook", "anchor")).toBe("#ch1-title")
      expect(fragment(result, "ebook", "epubcfi")).toBe(
        "#epubcfi(/6/2!/4/2[ch1-title]/1:0)",
      )
      expect(
        result.readaloud?.find((ref) => ref.fragmentKind === "media"),
      ).toBeUndefined()
    })

    it("resolves a position in the last paragraph", async () => {
      const result = await resolveReferences(books.all, "ebook", [
        `${CHAPTER_1}#char=55`,
      ])

      expect(fragment(result, "ebook", "anchor")).toBe("#ch1-p2")
      expect(fragment(result, "audiobook", "media")).toBe("#t=10")
    })

    it("resolves a position in another chapter", async () => {
      const result = await resolveReferences(books.all, "ebook", [
        `${CHAPTER_2}#char=20`,
      ])

      expect(path(result, "ebook", "char")).toBe(CHAPTER_2)
      expect(fragment(result, "ebook", "char")).toBe("#char=20")
      expect(fragment(result, "ebook", "anchor")).toBe("#ch2-p1")
      // 20s into the book is 8s into the second file of the standalone book
      expect(path(result, "audiobook", "media")).toBe(TRACK_2)
      expect(fragment(result, "audiobook", "media")).toBe("#t=8")
    })

    it("keeps the character offset when other fragment types come with it", async () => {
      const result = await resolveReferences(books.all, "ebook", [
        `${CHAPTER_1}#ch1-title`,
        `${CHAPTER_1}#char=27`,
      ])

      expect(fragment(result, "ebook", "char")).toBe("#char=27")
      // Derived from the char fragment, not the anchor
      expect(fragment(result, "audiobook", "media")).toBe("#t=10")
      expect(
        refStrings(result.ebook)?.filter((ref) => ref.includes("#char="))
          .length,
      ).toBe(1)
    })

    it("ignores an audio reference sent along with a character offset", async () => {
      const result = await resolveReferences(books.all, "ebook", [
        `${CHAPTER_1}#char=15`,
        `${AUDIO_2}#t=5`,
      ])

      // an ebook request takes its bearings from the xhtml references only,
      // so every position is derived from the character offset: 15 is in the
      // first paragraph, at the front of the book
      expect(fragment(result, "readaloud", "media")).toBe("#t=0")
      expect(path(result, "readaloud", "media")).toBe(AUDIO_1)
      expect(fragment(result, "audiobook", "media")).toBe("#t=0")
      expect(path(result, "audiobook", "media")).toBe(TRACK_1)
    })

    it("keeps the timestamp the client sent instead of recomputing one", async () => {
      const result = await resolveReferences(books.all, "readaloud", [
        `${CHAPTER_1}#char=15`,
        `${AUDIO_2}#t=5`,
      ])

      expect(fragment(result, "ebook", "anchor")).toBe("#ch1-p1")
      expect(fragment(result, "readaloud", "media")).toBe("#t=5")
      expect(path(result, "audiobook", "media")).toBe(TRACK_3)
      expect(fragment(result, "audiobook", "media")).toBe("#t=3")
    })
  })

  describe("from an anchor", () => {
    it("adds the character offset the anchor starts at", async () => {
      const result = await resolveReferences(books.all, "readaloud", [
        `${CHAPTER_1}#ch1-p2`,
      ])

      expect(fragment(result, "readaloud", "char")).toBe("#char=27")
      expect(fragment(result, "ebook", "char")).toBe("#char=27")
    })

    it("adds every other fragment type", async () => {
      const result = await resolveReferences(books.all, "readaloud", [
        `${CHAPTER_1}#ch1-p2`,
      ])

      const refs = result.readaloud
      const strings = refStrings(refs)

      // the readaloud list carries the audio position too, unlike the ebook's
      expect(refs?.map((ref) => ref.fragmentKind).toSorted()).toEqual([
        "anchor",
        "char",
        "crengine",
        "epubcfi",
        "media",
      ])
      expect(strings?.includes(`${CHAPTER_1}#char=27`)).toBeTruthy()
      expect(strings?.includes(`${CHAPTER_1}#ch1-p2`)).toBeTruthy()
      expect(fragment(result, "readaloud", "crengine") ?? "").toMatch(
        /\/p\[2\]\.0\)$/,
      )
      expect(fragment(result, "readaloud", "epubcfi") ?? "").toMatch(
        /\/6\[ch1-p2\]\/1:0\)$/,
      )
      expect(fragment(result, "audiobook", "media")).toBe("#t=10")
    })

    it("adds the character offset for an anchor in another chapter", async () => {
      const result = await resolveReferences(books.all, "ebook", [
        `${CHAPTER_2}#ch2-p1`,
      ])

      expect(path(result, "ebook", "char")).toBe(CHAPTER_2)
      expect(fragment(result, "ebook", "char")).toBe("#char=11")
      expect(fragment(result, "audiobook", "media")).toBe("#t=8")
    })

    it("adds the character offset for a heading", async () => {
      const result = await resolveReferences(books.all, "ebook", [
        `${CHAPTER_1}#ch1-title`,
      ])

      expect(fragment(result, "ebook", "char")).toBe("#char=0")
      expect(fragment(result, "ebook", "anchor")).toBe("#ch1-title")
      expect(fragment(result, "audiobook", "media")).toBeUndefined()
    })

    it("returns a reference it cannot resolve unchanged", async () => {
      const result = await resolveReferences(books.all, "ebook", [
        `${CHAPTER_1}#not-in-the-book`,
      ])

      expect(Object.keys(result)).toEqual(["ebook"])
      expect(refStrings(result.ebook)).toEqual([`${CHAPTER_1}#not-in-the-book`])
    })
  })

  describe("from an EPUB CFI", () => {
    it("adds the character offset the range starts at", async () => {
      const result = await resolveReferences(books.all, "ebook", [
        `${CHAPTER_1}#epubcfi(/6/2!/4/4[ch1-p1]/1:4)`,
      ])

      expect(fragment(result, "ebook", "char")).toBe("#char=15")
      expect(fragment(result, "ebook", "anchor")).toBe("#ch1-p1")
      expect(fragment(result, "audiobook", "media")).toBe("#t=0")
    })

    it("adds every other fragment type", async () => {
      const sent = `${CHAPTER_1}#epubcfi(/6/2!/4/6[ch1-p2]/1:0)`

      const result = await resolveReferences(books.all, "ebook", [sent])

      expect(fragment(result, "ebook", "char")).toBe("#char=27")
      expect(fragment(result, "ebook", "anchor")).toBe("#ch1-p2")
      expect(fragment(result, "ebook", "crengine") ?? "").toMatch(
        /\/p\[2\]\/text\(\)\[1\]\.0\)$/,
      )
      expect(
        refStrings(result.ebook)?.filter((ref) => ref.includes("epubcfi")),
      ).toEqual([sent])
      expect(refStrings(result.ebook)?.length).toBe(4)
    })

    it("resolves a CFI for another chapter", async () => {
      const result = await resolveReferences(books.all, "ebook", [
        `${CHAPTER_2}#epubcfi(/6/4!/4/4[ch2-p1]/1:4)`,
      ])

      expect(path(result, "ebook", "char")).toBe(CHAPTER_2)
      expect(fragment(result, "ebook", "char")).toBe("#char=15")
      expect(fragment(result, "audiobook", "media")).toBe("#t=8")
    })

    it("returns a CFI it cannot resolve unchanged", async () => {
      const sent = `${CHAPTER_1}#epubcfi(/6/99!/4/4[ch1-p1]/1:4)`

      const result = await resolveReferences(books.all, "ebook", [sent])

      expect(Object.keys(result)).toEqual(["ebook"])
      expect(refStrings(result.ebook)).toEqual([sent])
    })
  })

  describe("from a crengine xpointer", () => {
    it("adds the character offset the xpointer addresses", async () => {
      const result = await resolveReferences(books.all, "ebook", [
        `#crengine(/body[1]/DocFragment[1]/body[1]/p[1]/text()[1].4)`,
      ])

      expect(fragment(result, "ebook", "char")).toBe("#char=15")
      expect(fragment(result, "ebook", "anchor")).toBe("#ch1-p1")
      expect(fragment(result, "audiobook", "media")).toBe("#t=0")
    })

    it("adds every other fragment type", async () => {
      const result = await resolveReferences(books.all, "readaloud", [
        `#crengine(/body[1]/DocFragment[1]/body[1]/p[2]/text()[1].0)`,
      ])

      expect(fragment(result, "readaloud", "char")).toBe("#char=27")
      expect(fragment(result, "readaloud", "anchor")).toBe("#ch1-p2")
      expect(fragment(result, "readaloud", "epubcfi") ?? "").toMatch(
        /\/6\[ch1-p2\]\/1:0\)$/,
      )
      expect(fragment(result, "audiobook", "media")).toBe("#t=10")
    })

    it("resolves an xpointer for another chapter", async () => {
      const result = await resolveReferences(books.all, "ebook", [
        `#crengine(/body[1]/DocFragment[2]/body[1]/p[1]/text()[1].4)`,
      ])

      expect(path(result, "ebook", "char")).toBe(CHAPTER_2)
      expect(fragment(result, "ebook", "char")).toBe("#char=15")
      expect(fragment(result, "audiobook", "media")).toBe("#t=8")
    })

    it("returns an xpointer it cannot resolve unchanged", async () => {
      const sent = `#crengine(/body[1]/DocFragment[3]/body[1]/p[1]/text()[1].4)`

      const result = await resolveReferences(books.all, "ebook", [sent])

      expect(Object.keys(result)).toEqual(["ebook"])
      expect(refStrings(result.ebook)).toEqual([sent])
    })
  })

  describe("from a media temporal fragment", () => {
    it("adds the position the timestamp falls on", async () => {
      const result = await resolveReferences(books.all, "audiobook", [
        `${TRACK_1}#t=10`,
      ])

      expect(fragment(result, "ebook", "char")).toBe("#char=27")
      expect(path(result, "ebook", "char")).toBe(CHAPTER_1)
      expect(fragment(result, "ebook", "anchor")).toBe("#ch1-p2")
      expect(fragment(result, "readaloud", "anchor")).toBe("#ch1-p2")
    })

    it("keeps the timestamp the client sent", async () => {
      const result = await resolveReferences(books.all, "audiobook", [
        `${TRACK_1}#t=10,11`,
      ])

      expect(refStrings(result.audiobook)).toEqual([`${TRACK_1}#t=10,11`])
    })

    it("resolves a timestamp in another audio file", async () => {
      const result = await resolveReferences(books.all, "audiobook", [
        `${TRACK_3}#t=3`,
      ])

      expect(path(result, "ebook", "char")).toBe(CHAPTER_2)
      expect(fragment(result, "ebook", "char")).toBe("#char=11")
      expect(fragment(result, "ebook", "anchor")).toBe("#ch2-p1")
    })

    it("returns a timestamp it cannot place unchanged", async () => {
      const sent = `${TRACK_1}#t=99,100`

      const result = await resolveReferences(books.all, "audiobook", [sent])

      expect(Object.keys(result)).toEqual(["audiobook"])
      expect(refStrings(result.audiobook)).toEqual([sent])
    })
  })

  describe("readaloud and standalone audio", () => {
    it("counts a readaloud position across the standalone book", async () => {
      // 5s into the readaloud's second file is 25s into the book, which is 3s
      // into the third file of the standalone book
      const translated = await readaloudToStandaloneAudioReference(
        books.all,
        new UriReference(`${AUDIO_2}#t=5`),
      )

      expect(translated?.href).toBe(`${TRACK_3}#t=3`)
    })

    it("counts a standalone position across the readaloud", async () => {
      const translated = await standaloneToReadaloudAudioReference(
        books.all,
        new UriReference(`${TRACK_3}#t=3`),
      )

      expect(translated?.href).toBe(`${AUDIO_2}#t=5`)
    })

    it("lands back where a position started", async () => {
      const sent = new UriReference(`${AUDIO_2}#t=5`)

      const standalone = await readaloudToStandaloneAudioReference(
        books.all,
        sent,
      )

      expect(standalone).toBeTruthy()

      const back = await standaloneToReadaloudAudioReference(
        books.all,
        standalone!,
      )

      expect(back?.href).toBe(sent.href)
    })

    it("resolves a standalone timestamp through the readaloud to the text", async () => {
      const result = await resolveReferences(books.all, "audiobook", [
        `${TRACK_2}#t=8`,
      ])

      expect(path(result, "ebook", "char")).toBe(CHAPTER_2)
      expect(fragment(result, "ebook", "char")).toBe("#char=11")
      expect(path(result, "readaloud", "media")).toBe(AUDIO_2)
      expect(fragment(result, "readaloud", "media")).toBe("#t=0")
    })

    it("gives up translating a recording of another length", async () => {
      expect(
        await readaloudToStandaloneAudioReference(
          books.mismatchedAudio,
          new UriReference(`${AUDIO_1}#t=10`),
        ),
      ).toBeNull()
    })

    it("adds no audiobook reference it cannot place", async () => {
      // the book has no standalone ebook, so the readaloud is the format a
      // client of this book reports
      const result = await resolveReferences(
        books.mismatchedAudio,
        "readaloud",
        [`${CHAPTER_1}#char=27`],
      )

      expect(fragment(result, "readaloud", "media")).toBe("#t=10")
      expect(result.audiobook).toBeUndefined()
    })

    it("encodes the name of a standalone file", async () => {
      const translated = await readaloudToStandaloneAudioReference(
        books.encodedAudio,
        new UriReference(`${AUDIO_1}#t=7`),
      )

      expect(translated?.hrefPathname).toBe(
        "01%20-%20Ishmael%20%26%20Queequeg.mp3",
      )
      expect(translated?.fragment.toString()).toBe("#t=7")
    })

    it("translates an ebook offset through the readaloud to the standalone book", async () => {
      const result = await resolveReferences(books.all, "ebook", [
        `${CHAPTER_2}#char=20`,
      ])

      expect(path(result, "readaloud", "char")).toBe(CHAPTER_2)
      expect(fragment(result, "readaloud", "char")).toBe("#char=20")
      expect(fragment(result, "readaloud", "anchor")).toBe("#ch2-p1")

      // The overlays put that paragraph at the front of the readaloud's second
      // audio file, 20 seconds into the book
      expect(path(result, "readaloud", "media")).toBe(AUDIO_2)
      expect(fragment(result, "readaloud", "media")).toBe("#t=0")

      // The standalone audiobook is the same length, but its second file starts 12
      // seconds into it instead of 20
      expect(path(result, "audiobook", "media")).toBe(TRACK_2)
      expect(fragment(result, "audiobook", "media")).toBe("#t=8")
    })

    it("reads an encoded standalone name back", async () => {
      const standalone = await readaloudToStandaloneAudioReference(
        books.encodedAudio,
        new UriReference(`${AUDIO_1}#t=7`),
      )

      expect(standalone).toBeTruthy()

      expect(
        (
          await standaloneToReadaloudAudioReference(
            books.encodedAudio,
            standalone!,
          )
        )?.href,
      ).toBe(`${AUDIO_1}#t=7`)
    })
  })

  describe("readaloud anchors", () => {
    it("uses the overlaid paragraph around an id the overlays ignore", async () => {
      const result = await resolveReferences(books.extraIds, "readaloud", [
        `${CHAPTER_1}#char=46`,
      ])

      expect(fragment(result, "readaloud", "anchor")).toBe("#ch1-p2")
      expect(fragment(result, "readaloud", "media")).toBe("#t=10")
      expect(fragment(result, "audiobook", "media")).toBe("#t=10")
    })

    it("uses an overlaid anchor instead of the id the offset falls in", async () => {
      const result = await resolveReferences(books.extraIds, "readaloud", [
        `${CHAPTER_1}#char=60`,
      ])

      expect(fragment(result, "readaloud", "anchor")).toBe("#ch1-p2")
      expect(fragment(result, "readaloud", "media")).toBe("#t=10")
    })

    it("walks back over an ignored id to reach one the overlays reference", async () => {
      const result = await resolveReferences(books.extraIds, "readaloud", [
        `${CHAPTER_1}#char=82`,
      ])

      expect(fragment(result, "readaloud", "anchor")).toBe("#ch1-p2")
    })

    it("skips anchor if position is before any overlay-referenced anchors", async () => {
      const result = await resolveReferences(books.extraIds, "readaloud", [
        `${CHAPTER_1}#char=5`,
      ])

      expect(fragment(result, "readaloud", "anchor")).toBeUndefined()
      expect(fragment(result, "readaloud", "char")).toBe("#char=5")
      expect(fragment(result, "readaloud", "media")).toBeUndefined()
    })

    it("keeps the nearest id for an ebook", async () => {
      const inside = await resolveReferences(books.extraIds, "ebook", [
        `${CHAPTER_1}#char=46`,
      ])
      const after = await resolveReferences(books.extraIds, "ebook", [
        `${CHAPTER_1}#char=82`,
      ])

      expect(fragment(inside, "ebook", "anchor")).toBe("#ch1-em")
      expect(fragment(after, "ebook", "anchor")).toBe("#ch1-note")
    })
  })

  describe("round trips", () => {
    let derivedRefs!: {
      anchor: string | undefined
      epubcfi: string | undefined
      crengine: string | undefined
    }

    beforeAll(async () => {
      const result = await resolveReferences(books.all, "ebook", [
        `${CHAPTER_1}#char=27`,
      ])

      derivedRefs = {
        anchor: fragment(result, "ebook", "anchor"),
        epubcfi: fragment(result, "ebook", "epubcfi"),
        crengine: fragment(result, "ebook", "crengine"),
      }
    })

    it.for(["anchor", "epubcfi", "crengine"] as const)(
      "resolves a %s reference back to the char offset it came from",
      async (kind) => {
        const value = derivedRefs[kind]

        expect(value).toBeTruthy()

        const reference = `${CHAPTER_1}${value}`
        const result = await resolveReferences(books.all, "ebook", [reference])

        expect(fragment(result, "ebook", "char")).toBe("#char=27")
      },
    )
  })

  describe("formats the book does not have", () => {
    it("resolves the ebook formats when there is no readaloud", async () => {
      const result = await resolveReferences(books.ebookOnly, "ebook", [
        `${CHAPTER_1}#char=15`,
      ])

      expect(Object.keys(result)).toEqual(["ebook"])
      expect(fragment(result, "ebook", "char")).toBe("#char=15")
      expect(fragment(result, "ebook", "anchor")).toBe("#ch1-p1")
    })

    it("skips a readaloud that is not aligned yet", async () => {
      const result = await resolveReferences(books.unaligned, "ebook", [
        `${CHAPTER_1}#char=15`,
      ])

      expect(Object.keys(result)).toEqual(["ebook"])
      expect(fragment(result, "ebook", "anchor")).toBe("#ch1-p1")
    })

    it("returns only the audio reference when the book has no text", async () => {
      const result = await resolveReferences(books.audiobookOnly, "audiobook", [
        `${TRACK_1}#t=12,13`,
      ])

      expect(Object.keys(result)).toEqual(["audiobook"])
      expect(refStrings(result.audiobook)).toEqual([`${TRACK_1}#t=12,13`])
    })
  })

  describe("references it cannot use", () => {
    it("throws when no reference carries a usable fragment", async () => {
      await expect(() =>
        resolveReferences(books.all, "ebook", [
          `${TRACK_1}#track=1`,
          `#xpointer(id("ch1-p1"))`,
        ]),
      ).rejects.toThrow(/No valid EPUB or audiobook references found/)
    })
  })
})
