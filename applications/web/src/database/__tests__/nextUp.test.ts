import assert from "node:assert"

import { describe, it } from "vitest"

import {
  type TestDbContext,
  seedBooks,
  seedUser,
  seedSeries,
  setupTestDb,
} from "@/__tests__/harness/testDb"
import { getNextUpInSeries } from "@/database/nextUp"
import { type UUID } from "@/uuid"

const userId = "11111111-1111-1111-1111-111111111111" as UUID

function setStatus(ctx: TestDbContext, bookUuid: string, statusName: string) {
  ctx.sqlite
    .prepare(
      `INSERT INTO book_to_status (book_uuid, status_uuid, user_id)
       VALUES (?, (SELECT uuid FROM status WHERE name = ?), ?)`,
    )
    .run(bookUuid, statusName, userId)
}

function setPosition(ctx: TestDbContext, bookUuid: string, timestamp: number) {
  ctx.sqlite
    .prepare(
      `INSERT INTO position (book_uuid, user_id, locator, timestamp) VALUES (?, ?, '{}', ?)`,
    )
    .run(bookUuid, userId, timestamp)
}

describe("getNextUpInSeries", () => {
  it("returns the lowest unread position above the highest read one", async () => {
    using ctx = setupTestDb()
    seedUser(ctx, userId)

    const [b1, b2, b3, b4] = seedBooks(ctx, [
      { title: "one" },
      { title: "two" },
      { title: "three" },
      { title: "four" },
    ]) as [string, string, string, string]
    seedSeries(ctx, "saga", [
      [b1, 1],
      [b2, 2],
      [b3, 3],
      [b4, 4],
    ])
    setStatus(ctx, b1, "Read")
    setStatus(ctx, b2, "Read")
    setStatus(ctx, b3, "To read")
    setStatus(ctx, b4, "To read")

    const books = await getNextUpInSeries(userId)
    assert.deepStrictEqual(
      books.map((b) => b.title),
      ["three"],
    )
  })

  it("skips a book being read and shows the next to-be-read one", async () => {
    using ctx = setupTestDb()
    seedUser(ctx, userId)

    const [b1, b2, b3] = seedBooks(ctx, [
      { title: "one" },
      { title: "two" },
      { title: "three" },
    ]) as [string, string, string]
    seedSeries(ctx, "saga", [
      [b1, 1],
      [b2, 2],
      [b3, 3],
    ])
    setStatus(ctx, b1, "Read")
    setStatus(ctx, b2, "Reading")
    setStatus(ctx, b3, "To read")

    const books = await getNextUpInSeries(userId)
    assert.deepStrictEqual(
      books.map((b) => b.title),
      ["three"],
    )
  })

  it("does not surface series without any read book, or fully read ones", async () => {
    using ctx = setupTestDb()
    seedUser(ctx, userId)

    const [b1, b2, b3, b4] = seedBooks(ctx, [
      { title: "fresh 1" },
      { title: "fresh 2" },
      { title: "done 1" },
      { title: "done 2" },
    ]) as [string, string, string, string]
    seedSeries(ctx, "untouched", [
      [b1, 1],
      [b2, 2],
    ])
    seedSeries(ctx, "finished", [
      [b3, 1],
      [b4, 2],
    ])
    setStatus(ctx, b1, "To read")
    setStatus(ctx, b2, "To read")
    setStatus(ctx, b3, "Read")
    setStatus(ctx, b4, "Read")

    const books = await getNextUpInSeries(userId)
    assert.deepStrictEqual(books, [])
  })

  it("accepts explicit To read status but not custom statuses", async () => {
    using ctx = setupTestDb()
    seedUser(ctx, userId)
    ctx.sqlite
      .prepare(`INSERT INTO status (name, is_default) VALUES ('Abandoned', 0)`)
      .run()

    const [b1, b2, b3] = seedBooks(ctx, [
      { title: "one" },
      { title: "two" },
      { title: "three" },
    ]) as [string, string, string]
    seedSeries(ctx, "saga", [
      [b1, 1],
      [b2, 2],
      [b3, 3],
    ])
    setStatus(ctx, b1, "Read")
    setStatus(ctx, b2, "Abandoned")
    setStatus(ctx, b3, "To read")

    const books = await getNextUpInSeries(userId)
    assert.deepStrictEqual(
      books.map((b) => b.title),
      ["three"],
    )
  })

  it("ignores a book with no status of its own", async () => {
    using ctx = setupTestDb()
    seedUser(ctx, userId)

    const [b1, b2, b3] = seedBooks(ctx, [
      { title: "one" },
      { title: "two" },
      { title: "three" },
    ]) as [string, string, string]
    seedSeries(ctx, "saga", [
      [b1, 1],
      [b2, 2],
      [b3, 3],
    ])
    setStatus(ctx, b1, "Read")
    setStatus(ctx, b3, "To read")

    const books = await getNextUpInSeries(userId)
    assert.deepStrictEqual(
      books.map((b) => b.title),
      ["three"],
    )
  })

  it("orders series by most recent reading activity", async () => {
    using ctx = setupTestDb()
    seedUser(ctx, userId)

    const [a1, a2, c1, c2] = seedBooks(ctx, [
      { title: "old series read" },
      { title: "old series next" },
      { title: "active series read" },
      { title: "active series next" },
    ]) as [string, string, string, string]
    seedSeries(ctx, "old", [
      [a1, 1],
      [a2, 2],
    ])
    seedSeries(ctx, "active", [
      [c1, 1],
      [c2, 2],
    ])
    setStatus(ctx, a1, "Read")
    setStatus(ctx, a2, "To read")
    setStatus(ctx, c1, "Read")
    setStatus(ctx, c2, "To read")
    setPosition(ctx, a1, 1_000)
    setPosition(ctx, c1, 2_000)

    const books = await getNextUpInSeries(userId)
    assert.deepStrictEqual(
      books.map((b) => b.title),
      ["active series next", "old series next"],
    )
  })

  it("breaks ties between books sharing a number by oldest added", async () => {
    using ctx = setupTestDb()
    seedUser(ctx, userId)

    // Seeded so both insertion order and title order disagree with
    // created_at order
    const [b1, newer, older] = seedBooks(ctx, [
      { title: "one" },
      { title: "Two (hardcover)" },
      { title: "two (paperback)" },
    ]) as [string, string, string]
    const setCreatedAt = ctx.sqlite.prepare(
      `UPDATE book SET created_at = ? WHERE uuid = ?`,
    )
    setCreatedAt.run("2021-01-01 00:00:00", newer)
    setCreatedAt.run("2020-01-01 00:00:00", older)
    seedSeries(ctx, "saga", [
      [b1, 1],
      [newer, 2],
      [older, 2],
    ])
    setStatus(ctx, b1, "Read")
    setStatus(ctx, newer, "To read")
    setStatus(ctx, older, "To read")

    const books = await getNextUpInSeries(userId)
    assert.deepStrictEqual(
      books.map((b) => b.title),
      ["two (paperback)"],
    )
  })

  it("returns a shared book once even when it is next in two series", async () => {
    using ctx = setupTestDb()
    seedUser(ctx, userId)

    const [b1, b2, shared] = seedBooks(ctx, [
      { title: "read one" },
      { title: "read two" },
      { title: "shared next" },
    ]) as [string, string, string]
    seedSeries(ctx, "first", [
      [b1, 1],
      [shared, 2],
    ])
    seedSeries(ctx, "second", [
      [b2, 1],
      [shared, 2],
    ])
    setStatus(ctx, b1, "Read")
    setStatus(ctx, b2, "Read")
    setStatus(ctx, shared, "To read")

    const books = await getNextUpInSeries(userId)
    assert.deepStrictEqual(
      books.map((b) => b.title),
      ["shared next"],
    )
  })
})
