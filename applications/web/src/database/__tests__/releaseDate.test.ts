import assert from "node:assert"

import { describe, it } from "vitest"

import {
  type TestDbContext,
  seedBooks,
  setupTestDb,
} from "@/__tests__/harness/testDb"
import { getBook } from "@/database/books"
import { type UUID } from "@/uuid"

function setRawDates(
  ctx: TestDbContext,
  uuid: string,
  releaseDate: string | null,
  publicationDate: string | null,
) {
  ctx.sqlite
    .prepare(
      `UPDATE book SET release_date = ?, publication_date = ? WHERE uuid = ?`,
    )
    .run(releaseDate, publicationDate, uuid)
}

describe("book releaseDate", () => {
  it("normalizes a bare year through toIsoDateString", async () => {
    using db = setupTestDb()

    const [uuid] = seedBooks(db, [{ title: "bare year" }])
    assert.ok(uuid)
    setRawDates(db, uuid, "2019", "1979")

    const book = await getBook(uuid as UUID)
    assert.ok(book)
    assert.strictEqual(book.releaseDate, "2019-01-01T00:00:00.000Z")
    assert.strictEqual(book.publicationDate, "1979-01-01T00:00:00.000Z")
  })

  it("keeps a full timestamp and a plain day intact", async () => {
    using db = setupTestDb()

    const [uuid] = seedBooks(db, [{ title: "full timestamp" }])
    assert.ok(uuid)
    setRawDates(db, uuid, "2019-06-04T12:30:00.000Z", "2019-06-04")

    const book = await getBook(uuid as UUID)
    assert.ok(book)
    assert.strictEqual(book.releaseDate, "2019-06-04T12:30:00.000Z")
    assert.strictEqual(book.publicationDate, "2019-06-04T00:00:00.000Z")
  })

  it("leaves an unset or unparseable release date null", async () => {
    using db = setupTestDb()

    const [unset, garbage] = seedBooks(db, [
      { title: "unset release" },
      { title: "garbage release" },
    ])
    assert.ok(unset)
    assert.ok(garbage)
    setRawDates(db, garbage, "sometime in the nineties", null)

    const unsetBook = await getBook(unset as UUID)
    assert.ok(unsetBook)
    assert.strictEqual(unsetBook.releaseDate, null)

    const garbageBook = await getBook(garbage as UUID)
    assert.ok(garbageBook)
    assert.strictEqual(garbageBook.releaseDate, null)
  })
})
