import assert from "node:assert"

import { beforeEach, describe, it, vi } from "vitest"

import {
  type BookMetadataCandidate,
  type BookMetadataSearchResult,
  type MetadataSearchQuery,
} from "@storyteller-platform/nodekit"

import {
  type TestDbContext,
  seedBooks,
  setupTestDb,
} from "@/__tests__/harness/testDb"
import { getBook, updateBook } from "@/database/books"
import { updateSettings } from "@/database/settings"
import { SETTINGS_DEFAULTS } from "@/database/settingsTypes"
import { autoImportMetadata } from "@/metadataAutoImport"
import { type UUID } from "@/uuid"

const nodekit = vi.hoisted(() => ({
  results: new Map<string, BookMetadataSearchResult[]>(),
  candidates: new Map<string, BookMetadataCandidate>(),
  searches: [] as MetadataSearchQuery[],
}))

vi.mock("@/services/nodekitService", () => ({
  getNodeKit: () => ({
    metadataSearch: (query: MetadataSearchQuery) => {
      nodekit.searches.push(query)
      return Promise.resolve(nodekit.results.get(query.provider ?? "") ?? [])
    },
    metadataBook: ({ provider, id }: { provider: string; id: string }) => {
      const candidate = nodekit.candidates.get(`${provider}:${id}`)
      return candidate
        ? Promise.resolve(candidate)
        : Promise.reject(new Error("not found"))
    },
  }),
}))

const hardcoverToken = vi.hoisted(() => ({
  value: "hc-token" as string | null,
}))

vi.mock("@/database/providerTokens", () => ({
  readHardcoverToken: () =>
    Promise.resolve({
      token: hardcoverToken.value,
      status: {
        tokenSet: true,
        source: "database",
        locked: false,
        unreadable: false,
      },
    }),
}))

const HARDCOVER: BookMetadataCandidate = {
  provider: "hardcover",
  id: "312460",
  slug: "dune",
  title: "Dune",
  description: "A desert planet.",
  language: "en",
  authors: ["Frank Herbert"],
  narrators: ["Hardcover Narrator"],
  creators: [],
  series: [{ name: "Dune", position: 1 }],
  tags: [{ category: "Genre", name: "Science Fiction", count: 10 }],
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
  description: "An audiobook about a desert planet.",
  authors: ["Frank Herbert"],
  narrators: ["Scott Brick"],
  creators: [],
  series: [],
  tags: [],
  releaseDate: "2007-04-10",
  rating: 4.5,
}

function searchResult(
  candidate: BookMetadataCandidate,
  overrides: Partial<BookMetadataSearchResult> = {},
): BookMetadataSearchResult {
  return {
    provider: candidate.provider,
    id: candidate.id ?? "",
    title: candidate.title,
    authors: candidate.authors,
    narrators: candidate.narrators,
    ...overrides,
  }
}

function seedProviderRows(ctx: TestDbContext) {
  ctx.sqlite.exec(`
    INSERT INTO external_source (name, kind) VALUES ('Hardcover', 'hardcover'), ('Audible', 'audible');
    INSERT INTO identifier_type (name, kind) VALUES
      ('Hardcover Book ID', 'hardcover-book-id'),
      ('Hardcover Book Slug', 'hardcover-book-slug'),
      ('Hardcover Edition ID', 'hardcover-edition-id'),
      ('ISBN-13', 'isbn-13'),
      ('Audible ASIN', 'audible');
  `)
}

async function seedDune(ctx: TestDbContext) {
  seedProviderRows(ctx)
  const [bookUuid] = seedBooks(ctx, [
    { title: "Dune", ebook: "/tmp/dune.epub", audiobook: "/tmp/dune" },
  ]) as [UUID]
  await updateBook(
    bookUuid,
    { subtitle: "My own subtitle" },
    {
      creators: [
        { name: "Frank Herbert", fileAs: "Herbert, Frank", role: "aut" },
      ],
    },
  )
  const book = await getBook(bookUuid)
  assert.ok(book)
  return book
}

beforeEach(() => {
  hardcoverToken.value = "hc-token"
  nodekit.results.clear()
  nodekit.candidates.clear()
  nodekit.searches = []
  nodekit.results.set("hardcover", [searchResult(HARDCOVER)])
  nodekit.results.set("audnexus", [searchResult(AUDNEXUS)])
  nodekit.candidates.set("hardcover:312460", HARDCOVER)
  nodekit.candidates.set("audnexus:B002V1OF70", AUDNEXUS)
})

describe("autoImportMetadata", () => {
  it("fills only the empty fields from confident matches", async () => {
    using ctx = setupTestDb()
    const book = await seedDune(ctx)
    await updateSettings({
      ...SETTINGS_DEFAULTS,
      metadataAutoImportThresholds: { audnexus: "medium", hardcover: "medium" },
    })

    const result = await autoImportMetadata(book)

    assert.strictEqual(result.status, "applied")
    assert.strictEqual(result.book.subtitle, "My own subtitle")
    assert.strictEqual(result.book.description, "A desert planet.")
    assert.strictEqual(result.book.releaseDate, "2007-04-10T00:00:00.000Z")
    assert.deepStrictEqual(
      result.book.narrators.map((narrator) => narrator.name),
      ["Scott Brick"],
    )
    assert.deepStrictEqual(
      result.book.authors.map((author) => author.name),
      ["Frank Herbert"],
    )
    assert.deepStrictEqual(
      result.book.series.map((series) => series.name),
      ["Dune"],
    )
    assert.ok(!result.fields.includes("subtitle"))
    assert.ok(!result.fields.includes("authors"))
    assert.deepStrictEqual(
      result.book.externalData.map((entry) => entry.rating).sort(),
      [4.21, 4.5],
    )
    assert.deepStrictEqual(
      nodekit.searches.map((search) => search.query),
      ["Dune Frank Herbert", "Dune Frank Herbert"],
    )
  })

  it("changes nothing when no match reaches its threshold", async () => {
    using ctx = setupTestDb()
    const book = await seedDune(ctx)
    await updateSettings({
      ...SETTINGS_DEFAULTS,
      metadataAutoImportThresholds: {
        audnexus: "certain",
        hardcover: "certain",
      },
    })
    nodekit.results.set("hardcover", [
      searchResult(HARDCOVER, { title: "Dune Messiah" }),
    ])
    nodekit.results.set("audnexus", [
      searchResult(AUDNEXUS, { title: "Dune Messiah" }),
    ])

    const result = await autoImportMetadata(book)

    assert.strictEqual(result.status, "unsure")
    assert.deepStrictEqual(result.fields, [])
    assert.strictEqual(result.book.description, null)
    assert.deepStrictEqual(result.book.externalData, [])
  })

  it("does not search when no provider fits the book", async () => {
    using ctx = setupTestDb()
    seedProviderRows(ctx)
    const [bookUuid] = seedBooks(ctx, [
      { title: "Dune", ebook: "/tmp/dune.epub" },
    ]) as [UUID]
    const book = await getBook(bookUuid)
    assert.ok(book)
    hardcoverToken.value = null

    const result = await autoImportMetadata(book)

    assert.strictEqual(result.status, "notSearched")
    assert.deepStrictEqual(nodekit.searches, [])
  })

  it("reports books no provider found", async () => {
    using ctx = setupTestDb()
    const book = await seedDune(ctx)
    nodekit.results.clear()

    const result = await autoImportMetadata(book)

    assert.strictEqual(result.status, "noMatch")
    assert.deepStrictEqual(result.matches, [])
  })
})
