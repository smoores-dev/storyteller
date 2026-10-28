import assert from "node:assert"

import { describe, it } from "vitest"

import { seedBooks, seedUser, setupTestDb } from "@/__tests__/harness/testDb"
import {
  NONE_FACET_KEY,
  getLibraryCounts,
  getSectionFacets,
} from "@/database/libraryCounts"
import { type UUID } from "@/uuid"

const userId = "11111111-1111-1111-1111-111111111111" as UUID
const reader = { id: userId, permissions: { bookList: true } }
const bookUpdater = {
  id: userId,
  permissions: { bookList: true, bookUpdate: true },
}
const privateCollection = "55555555-5555-5555-5555-555555555555"
const memberCollection = "66666666-6666-6666-6666-666666666666"

function seedLibrary(ctx: ReturnType<typeof setupTestDb>) {
  const { sqlite } = ctx
  seedUser(ctx, userId)

  const [open, hidden] = seedBooks(ctx, [
    { title: "open" },
    { title: "hidden" },
  ])

  const collection = sqlite.prepare(
    `INSERT INTO collection (uuid, name, public) VALUES (?, ?, 0)`,
  )
  collection.run(privateCollection, "Private")
  collection.run(memberCollection, "Empty but shared")
  sqlite
    .prepare(
      `INSERT INTO book_to_collection (book_uuid, collection_uuid) VALUES (?, ?)`,
    )
    .run(hidden, privateCollection)
  sqlite
    .prepare(
      `INSERT INTO collection_to_user (collection_uuid, user_id) VALUES (?, ?)`,
    )
    .run(memberCollection, userId)

  const tag = sqlite.prepare(`INSERT INTO tag (uuid, name) VALUES (?, ?)`)
  const bookToTag = sqlite.prepare(
    `INSERT INTO book_to_tag (book_uuid, tag_uuid) VALUES (?, ?)`,
  )
  tag.run("a0000000-0000-0000-0000-000000000001", "Shared")
  tag.run("a0000000-0000-0000-0000-000000000002", "Secret")
  tag.run("a0000000-0000-0000-0000-000000000003", "Orphan")
  bookToTag.run(open, "a0000000-0000-0000-0000-000000000001")
  bookToTag.run(hidden, "a0000000-0000-0000-0000-000000000001")
  bookToTag.run(hidden, "a0000000-0000-0000-0000-000000000002")

  const series = sqlite.prepare(`INSERT INTO series (uuid, name) VALUES (?, ?)`)
  const bookToSeries = sqlite.prepare(
    `INSERT INTO book_to_series (book_uuid, series_uuid) VALUES (?, ?)`,
  )
  series.run("b0000000-0000-0000-0000-000000000001", "Open series")
  series.run("b0000000-0000-0000-0000-000000000002", "Secret series")
  bookToSeries.run(open, "b0000000-0000-0000-0000-000000000001")
  bookToSeries.run(hidden, "b0000000-0000-0000-0000-000000000002")

  const creator = sqlite.prepare(
    `INSERT INTO creator (uuid, name, file_as) VALUES (?, ?, ?)`,
  )
  const bookToCreator = sqlite.prepare(
    `INSERT INTO book_to_creator (book_uuid, creator_uuid, role) VALUES (?, ?, 'aut')`,
  )
  creator.run("c0000000-0000-0000-0000-000000000001", "Open Author", "")
  creator.run("c0000000-0000-0000-0000-000000000002", "Secret Author", "")
  bookToCreator.run(open, "c0000000-0000-0000-0000-000000000001")
  bookToCreator.run(hidden, "c0000000-0000-0000-0000-000000000002")
}

function names(facets: { name: string }[]) {
  return facets.map((f) => f.name).sort()
}

describe("facet values on books the user cannot see", () => {
  it("hides empty tags, series and authors from readers", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const tags = await getSectionFacets(reader, "tags")
    assert.deepStrictEqual(
      tags.map((f) => [f.name, f.bookCount]),
      [["Shared", 1]],
    )

    const series = await getSectionFacets(reader, "series")
    assert.deepStrictEqual(names(series), ["Open series"])

    const authors = await getSectionFacets(reader, "authors")
    assert.deepStrictEqual(names(authors), ["Open Author"])
  })

  it("shows every tag, series and author to users who can update books", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const tags = await getSectionFacets(bookUpdater, "tags")
    assert.deepStrictEqual(names(tags), ["Orphan", "Secret", "Shared"])

    const series = await getSectionFacets(bookUpdater, "series")
    assert.deepStrictEqual(names(series), ["Open series", "Secret series"])

    const authors = await getSectionFacets(bookUpdater, "authors")
    assert.deepStrictEqual(names(authors), ["Open Author", "Secret Author"])
  })

  it("keeps an empty collection the reader was added to", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const collections = await getSectionFacets(reader, "collections")
    assert.deepStrictEqual(
      collections
        .filter((f) => f.key !== NONE_FACET_KEY)
        .map((f) => [f.name, f.bookCount]),
      [["Empty but shared", 0]],
    )
  })

  it("badge counts follow the same rule", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const readerCounts = await getLibraryCounts(reader)
    assert.strictEqual(readerCounts.tags, 1)
    assert.strictEqual(readerCounts.series, 1)
    assert.strictEqual(readerCounts.authors, 1)

    const updaterCounts = await getLibraryCounts(bookUpdater)
    assert.strictEqual(updaterCounts.tags, 3)
    assert.strictEqual(updaterCounts.series, 2)
    assert.strictEqual(updaterCounts.authors, 2)
  })
})
