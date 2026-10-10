import assert from "node:assert"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { cwd } from "node:process"

import { beforeEach, describe, it, vi } from "vitest"

import {
  type BookMetadataCandidate,
  type CoverCandidate,
  type CoverDownloadQuery,
  type CoverSearchQuery,
} from "@storyteller-platform/nodekit"

import {
  type TestDbContext,
  seedBooks,
  setupTestDb,
} from "@/__tests__/harness/testDb"
import { extractCoverFromEpub } from "@/assets/covers"
import { getInternalBookDirectory } from "@/assets/paths"
import { getBook, updateBook } from "@/database/books"
import {
  CoverImportError,
  applyCoverImport,
  applyMetadataImport,
  refreshExternalRatings,
} from "@/metadataImport"
import { MetadataImportRequestSchema } from "@/metadataImportTypes"
import { type UUID } from "@/uuid"

const nodekit = vi.hoisted(() => ({
  candidates: new Map<string, BookMetadataCandidate>(),
  covers: [] as CoverCandidate[],
  coverSearches: [] as CoverSearchQuery[],
  downloads: [] as CoverDownloadQuery[],
  download: null as null | ((query: CoverDownloadQuery) => Promise<unknown>),
}))

vi.mock("@/services/nodekitService", () => ({
  getNodeKit: () => ({
    metadataBook: ({ provider, id }: { provider: string; id: string }) => {
      const candidate = nodekit.candidates.get(`${provider}:${id}`)
      return candidate
        ? Promise.resolve(candidate)
        : Promise.reject(new Error("not found"))
    },
    coverSearch: (query: CoverSearchQuery) => {
      nodekit.coverSearches.push(query)
      return Promise.resolve(
        nodekit.covers.filter(
          (candidate) =>
            !query.providers || query.providers.includes(candidate.provider),
        ),
      )
    },
    download: (query: CoverDownloadQuery) => {
      assert.ok(nodekit.download)
      nodekit.downloads.push(query)
      return nodekit.download(query)
    },
  }),
}))

const HARDCOVER: BookMetadataCandidate = {
  provider: "hardcover",
  id: "312460",
  slug: "dune",
  title: "Dune",
  authors: ["Frank Herbert"],
  narrators: [],
  creators: [],
  series: [],
  tags: [],
  rating: 4.21,
  editions: [
    {
      id: "30405274",
      format: "ebook",
      isbn13: "9780441013593",
      narrators: [],
      otherContributors: [],
    },
  ],
}

const AUDNEXUS: BookMetadataCandidate = {
  provider: "audnexus",
  id: "B002V1OF70",
  title: "Dune",
  authors: ["Frank Herbert"],
  narrators: ["Scott Brick"],
  creators: [],
  series: [],
  tags: [],
  rating: 4.5,
}

function seedProviderRows(ctx: TestDbContext) {
  ctx.sqlite.exec(`
    INSERT INTO external_source (name, kind) VALUES ('Hardcover', 'hardcover'), ('Audible', 'audible');
    INSERT INTO identifier_type (name, kind) VALUES
      ('Hardcover Book ID', 'hardcover-book-id'),
      ('Hardcover Book Slug', 'hardcover-book-slug'),
      ('Hardcover Edition ID', 'hardcover-edition-id'),
      ('ISBN-13', 'isbn-13'),
      ('ASIN', 'asin'),
      ('Audible ASIN', 'audible');
  `)
}

function allIdentifiers(
  book: NonNullable<Awaited<ReturnType<typeof getBook>>>,
) {
  return [
    ...book.identifiers.map((entry) => ({ ...entry, scope: "book" })),
    ...(book.ebook?.identifiers ?? []).map((entry) => ({
      ...entry,
      scope: "ebook",
    })),
    ...(book.audiobook?.identifiers ?? []).map((entry) => ({
      ...entry,
      scope: "audiobook",
    })),
  ]
    .map((entry) => `${entry.scope}:${entry.kind}:${entry.value}`)
    .sort()
}

async function importInto(bookUuid: UUID, body: unknown) {
  const book = await getBook(bookUuid)
  assert.ok(book)
  return applyMetadataImport(book, MetadataImportRequestSchema.parse(body))
}

beforeEach(() => {
  nodekit.candidates.clear()
  nodekit.candidates.set("hardcover:312460", HARDCOVER)
  nodekit.candidates.set("audnexus:B002V1OF70", AUDNEXUS)
  nodekit.covers = []
  nodekit.coverSearches = []
  nodekit.downloads = []
  nodekit.download = null
})

describe("applyMetadataImport", () => {
  it("writes the chosen fields and keeps the roles it was not given", async () => {
    using ctx = setupTestDb()
    const [bookUuid] = seedBooks(ctx, [
      { title: "dune (retail)", audiobook: "/tmp/dune" },
    ]) as [UUID]
    const seeded = await getBook(bookUuid)
    assert.ok(seeded)
    await mkdir(getInternalBookDirectory(seeded), { recursive: true })

    await updateBook(bookUuid, null, {
      creators: [
        { name: "F. Herbert", fileAs: "Herbert, F.", role: "aut" },
        { name: "Simon Vance", fileAs: "Vance, Simon", role: "nrt" },
        { name: "Jane Doe", fileAs: "Doe, Jane", role: "trl" },
      ],
      tags: ["Old tag"],
    })

    const book = await importInto(bookUuid, {
      fields: {
        title: "Dune",
        releaseDate: "2007",
        publicationDate: "1965-08-01",
        authors: ["Frank Herbert"],
        series: [
          { name: "Dune Chronicles", position: "1" },
          { name: "Frank Herbert's Dune", position: null },
        ],
        tags: ["Science Fiction", "Classics"],
      },
      sources: [],
    })

    assert.strictEqual(book.title, "Dune")
    assert.strictEqual(book.releaseDate, "2007-01-01T00:00:00.000Z")
    assert.strictEqual(book.publicationDate, "1965-08-01T00:00:00.000Z")
    assert.deepStrictEqual(
      book.authors.map((author) => author.name),
      ["Frank Herbert"],
    )
    assert.deepStrictEqual(
      book.narrators.map((narrator) => narrator.name),
      ["Simon Vance"],
    )
    assert.deepStrictEqual(
      book.creators.map((creator) => [creator.name, creator.role]),
      [["Jane Doe", "trl"]],
    )
    assert.deepStrictEqual(
      book.series
        .map((series) => [series.name, series.position, series.featured])
        .sort(),
      [
        ["Dune Chronicles", 1, true],
        ["Frank Herbert's Dune", null, false],
      ],
    )
    assert.deepStrictEqual(book.tags.map((tag) => tag.name).sort(), [
      "Classics",
      "Science Fiction",
    ])
  })

  it("attaches only the selected identifiers, to the book rather than a format", async () => {
    using ctx = setupTestDb()
    seedProviderRows(ctx)
    const [bookUuid] = seedBooks(ctx, [
      { title: "Dune", ebook: "/tmp/dune.epub", audiobook: "/tmp/dune" },
    ]) as [UUID]

    const book = await importInto(bookUuid, {
      fields: {},
      sources: [
        { provider: "hardcover", id: "312460", editionId: "30405274" },
        { provider: "audnexus", id: "B002V1OF70" },
      ],
      identifiers: [
        { provider: "hardcover", kind: "isbn-13", value: "9780441013593" },
        { provider: "audnexus", kind: "audible", value: "B002V1OF70" },
        { provider: "hardcover", kind: "asin", value: "B000NOTREAL" },
      ],
    })

    assert.deepStrictEqual(allIdentifiers(book), [
      "book:audible:B002V1OF70",
      "book:isbn-13:9780441013593",
    ])
    assert.deepStrictEqual(book.externalData, [])
  })

  it("keeps its own identifier when the file already holds the same one", async () => {
    using ctx = setupTestDb()
    seedProviderRows(ctx)
    const [bookUuid] = seedBooks(ctx, [
      { title: "Dune", audiobook: "/tmp/dune" },
    ]) as [UUID]
    ctx.sqlite.exec(`
      INSERT INTO identifier (book_uuid, identifier_type_uuid, value, audiobook_uuid)
      SELECT '${bookUuid}', identifier_type.uuid, 'B002V1OF70', audiobook.uuid
      FROM identifier_type, audiobook
      WHERE identifier_type.kind = 'audible' AND audiobook.book_uuid = '${bookUuid}';
    `)

    const book = await importInto(bookUuid, {
      fields: {},
      sources: [{ provider: "audnexus", id: "B002V1OF70" }],
      ratingProviders: ["audnexus"],
    })

    assert.deepStrictEqual(allIdentifiers(book), [
      "audiobook:audible:B002V1OF70",
      "book:audible:B002V1OF70",
    ])
    assert.deepStrictEqual(
      book.externalData.map((entry) => [entry.sourceName, entry.rating]),
      [["Audible", 4.5]],
    )
  })

  it("stores a selected rating on the identifier that carries it", async () => {
    using ctx = setupTestDb()
    seedProviderRows(ctx)
    const [bookUuid] = seedBooks(ctx, [
      { title: "Dune", ebook: "/tmp/dune.epub" },
    ]) as [UUID]

    const request = {
      fields: {},
      sources: [{ provider: "hardcover", id: "312460" }],
      ratingProviders: ["hardcover"],
    }

    await importInto(bookUuid, request)
    nodekit.candidates.set("hardcover:312460", { ...HARDCOVER, rating: 4.3 })
    const book = await importInto(bookUuid, request)

    assert.deepStrictEqual(allIdentifiers(book), [
      "book:hardcover-book-id:312460",
    ])
    assert.deepStrictEqual(
      book.externalData.map((entry) => [entry.sourceName, entry.rating]),
      [["Hardcover", 4.3]],
    )
  })

  it("still applies the fields when a provider cannot be reached", async () => {
    using ctx = setupTestDb()
    seedProviderRows(ctx)
    const [bookUuid] = seedBooks(ctx, [
      { title: "Dune", ebook: "/tmp/dune.epub" },
    ]) as [UUID]
    nodekit.candidates.clear()

    const book = await importInto(bookUuid, {
      fields: { subtitle: "Book one" },
      sources: [{ provider: "hardcover", id: "312460" }],
      identifiers: [
        { provider: "hardcover", kind: "hardcover-book-id", value: "312460" },
      ],
    })

    assert.strictEqual(book.subtitle, "Book one")
    assert.deepStrictEqual(allIdentifiers(book), [])
  })
})

describe("refreshExternalRatings", () => {
  it("rates only the book's own identifier when a file holds the same one", async () => {
    using ctx = setupTestDb()
    seedProviderRows(ctx)
    const [bookUuid] = seedBooks(ctx, [
      { title: "Dune", audiobook: "/tmp/dune" },
    ]) as [UUID]
    ctx.sqlite.exec(`
      INSERT INTO identifier (book_uuid, identifier_type_uuid, value, audiobook_uuid)
      SELECT '${bookUuid}', identifier_type.uuid, 'B002V1OF70', audiobook.uuid
      FROM identifier_type, audiobook
      WHERE identifier_type.kind = 'audible' AND audiobook.book_uuid = '${bookUuid}';
      INSERT INTO identifier (book_uuid, identifier_type_uuid, value)
      SELECT '${bookUuid}', uuid, 'B002V1OF70'
      FROM identifier_type WHERE kind = 'audible';
    `)

    nodekit.candidates.set("audnexus:B002V1OF70", { ...AUDNEXUS, rating: 4.7 })
    const book = await refreshExternalRatings(bookUuid)

    assert.deepStrictEqual(
      book.externalData.map((entry) => [
        entry.sourceName,
        entry.identifierValue,
        entry.rating,
      ]),
      [["Audible", "B002V1OF70", 4.7]],
    )
  })
})

describe("applyCoverImport", () => {
  const SEARCH = { title: "Moby Dick", author: "Herman Melville" }

  const APPLE_AUDIO: CoverCandidate = {
    id: "apple-audio",
    provider: "apple",
    mediaKind: "audiobook",
    url: "https://is1-ssl.mzstatic.com/moby-dick-audio.jpg",
  }

  const HARDCOVER_TEXT: CoverCandidate = {
    id: "hardcover-text",
    provider: "hardcover",
    mediaKind: "ebook",
    url: "https://assets.hardcover.app/moby-dick.jpg",
  }

  async function serveCover() {
    const cover = await extractCoverFromEpub(
      join(cwd(), "src/__fixtures__/books/ebooks/moby-dick/moby-dick.epub"),
    )
    assert.ok(cover)
    nodekit.download = (query) =>
      Promise.resolve({
        filename: "cover.jpg",
        contentType: "image/jpeg",
        url: query.url,
        width: 0,
        height: 0,
        bytes: Buffer.from(cover.data),
      })
  }

  async function coversOf(bookUuid: UUID) {
    const book = await getBook(bookUuid)
    assert.ok(book)
    return {
      ebook: book.ebook?.cover?.sha256 ?? null,
      readaloud: book.readaloud?.cover?.sha256 ?? null,
      audiobook: book.audiobook?.cover?.sha256 ?? null,
    }
  }

  function seedMobyDick(ctx: TestDbContext) {
    const [bookUuid] = seedBooks(ctx, [
      {
        title: "Moby Dick",
        ebook: "/tmp/moby-dick.epub",
        audiobook: "/tmp/moby-dick",
        readaloud: "/tmp/moby-dick-readaloud.epub",
      },
    ]) as [UUID]
    return bookUuid
  }

  it("attaches the downloaded image to the chosen side only", async () => {
    using ctx = setupTestDb()
    const bookUuid = seedMobyDick(ctx)
    await serveCover()
    nodekit.covers = [APPLE_AUDIO, HARDCOVER_TEXT]

    const book = await getBook(bookUuid)
    assert.ok(book)
    const { files } = await applyCoverImport(book, {
      search: SEARCH,
      covers: [{ side: "audio", provider: "apple", id: "apple-audio" }],
    })

    const covers = await coversOf(bookUuid)
    assert.ok(covers.audiobook)
    assert.strictEqual(covers.ebook, null)
    assert.strictEqual(covers.readaloud, null)
    assert.deepStrictEqual(Object.keys(files), ["audio"])
    assert.deepStrictEqual(nodekit.coverSearches, [
      { ...SEARCH, providers: ["apple"] },
    ])
    assert.deepStrictEqual(nodekit.downloads, [
      { url: APPLE_AUDIO.url, provider: "apple" },
    ])
  })

  it("puts the text cover on the ebook and the readaloud from one request", async () => {
    using ctx = setupTestDb()
    const bookUuid = seedMobyDick(ctx)
    await serveCover()
    nodekit.covers = [APPLE_AUDIO, HARDCOVER_TEXT]

    const book = await getBook(bookUuid)
    assert.ok(book)
    const { files } = await applyCoverImport(book, {
      search: SEARCH,
      covers: [
        { side: "text", provider: "hardcover", id: "hardcover-text" },
        { side: "audio", provider: "apple", id: "apple-audio" },
      ],
    })

    const covers = await coversOf(bookUuid)
    assert.ok(covers.ebook)
    assert.strictEqual(covers.readaloud, covers.ebook)
    assert.ok(covers.audiobook)
    assert.deepStrictEqual(Object.keys(files).sort(), ["audio", "text"])
    assert.strictEqual(nodekit.coverSearches.length, 1)
  })

  it("refuses a cover the provider does not offer over https", async () => {
    using ctx = setupTestDb()
    const bookUuid = seedMobyDick(ctx)
    const book = await getBook(bookUuid)
    assert.ok(book)
    await serveCover()
    nodekit.covers = [{ ...APPLE_AUDIO, url: "http://169.254.169.254/latest" }]

    const notOffered = (error: unknown) =>
      error instanceof CoverImportError && error.code === "notOffered"

    await assert.rejects(
      applyCoverImport(book, {
        search: SEARCH,
        covers: [{ side: "audio", provider: "apple", id: "apple-audio" }],
      }),
      notOffered,
    )
    await assert.rejects(
      applyCoverImport(book, {
        search: SEARCH,
        covers: [{ side: "text", provider: "hardcover", id: "hardcover-text" }],
      }),
      notOffered,
    )

    assert.deepStrictEqual(nodekit.downloads, [])
    assert.deepStrictEqual(await coversOf(bookUuid), {
      ebook: null,
      readaloud: null,
      audiobook: null,
    })
  })
})
