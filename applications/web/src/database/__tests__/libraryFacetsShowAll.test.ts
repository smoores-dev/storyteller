import assert from "node:assert"
import { describe, it } from "node:test"

import { seedBooks, setupTestDb } from "@/__tests__/harness/testDb"
import { countBooks } from "@/database/books"
import { getLibraryCounts, getSectionFacets } from "@/database/libraryCounts"
import { type UUID } from "@/uuid"

const userId = "11111111-1111-1111-1111-111111111111" as UUID

function seedUser(sqlite: import("better-sqlite3").Database) {
  sqlite
    .prepare(`INSERT INTO user_permission (uuid, book_list) VALUES (?, 1)`)
    .run("22222222-2222-2222-2222-222222222222")
  sqlite
    .prepare(
      `INSERT INTO "user" (id, user_permission_uuid, email) VALUES (?, ?, ?)`,
    )
    .run(userId, "22222222-2222-2222-2222-222222222222", "t@example.com")
}

void describe("getSectionFacets show-all", () => {
  void it("ratings: shows all 6 buckets, empty ones at 0", async () => {
    using ctx = setupTestDb()
    seedUser(ctx.sqlite)

    const [b1, b2, b3] = seedBooks(ctx, [
      { title: "one" },
      { title: "two" },
      { title: "three" },
    ])

    const rate = ctx.sqlite.prepare(
      `INSERT INTO user_book_rating (user_id, book_uuid, rating) VALUES (?, ?, ?)`,
    )
    rate.run(userId, b1, 5) // 4.5-5
    rate.run(userId, b2, 5) // 4.5-5
    rate.run(userId, b3, 0.5) // 0.5-1.49

    const facets = await getSectionFacets(userId, "ratings")
    const byKey = Object.fromEntries(facets.map((f) => [f.key, f.bookCount]))

    assert.strictEqual(facets.length, 6)
    assert.strictEqual(byKey["4.5-5"], 2)
    assert.strictEqual(byKey["0.5-1.49"], 1)
    assert.strictEqual(byKey["0-0.49"], 0)
    assert.strictEqual(byKey["1.5-2.49"], 0)
    assert.strictEqual(byKey["2.5-3.49"], 0)
    assert.strictEqual(byKey["3.5-4.49"], 0)
  })

  void it("formats: shows all canonical buckets even when empty", async () => {
    using ctx = setupTestDb()

    seedBooks(ctx, [
      { title: "a", ebook: "a.epub" },
      { title: "b", ebook: "b.epub" },
    ])

    const facets = await getSectionFacets(userId, "formats")
    const byKey = Object.fromEntries(facets.map((f) => [f.key, f.bookCount]))

    assert.strictEqual(facets.length, 9)
    assert.strictEqual(byKey["ebook"], 2)
    assert.strictEqual(byKey["ebook-only"], 2)
    assert.strictEqual(byKey["audiobook"], 0)
    assert.strictEqual(byKey["readaloud"], 0)
    assert.strictEqual(byKey["audiobook-only"], 0)
    assert.strictEqual(byKey["readaloud-only"], 0)
    assert.strictEqual(byKey["missing-readaloud"], 0)
    assert.strictEqual(byKey["missing-files"], 0)
    assert.strictEqual(byKey["no-media"], 0)
  })

  void it("grades: shows all 8 grades in A+…F order, empty ones at 0", async () => {
    using ctx = setupTestDb()
    seedUser(ctx.sqlite)

    const [b1, b2, b3] = seedBooks(ctx, [
      { title: "one" },
      { title: "two" },
      { title: "three" },
    ])

    const report = ctx.sqlite.prepare(
      `INSERT INTO alignment_report (uuid, book_uuid, report, grade) VALUES (?, ?, ?, ?)`,
    )
    report.run("aaaaaaaa-0000-0000-0000-000000000001", b1, "{}", "S")
    report.run("aaaaaaaa-0000-0000-0000-000000000002", b2, "{}", "S")
    report.run("aaaaaaaa-0000-0000-0000-000000000003", b3, "{}", "C")

    const facets = await getSectionFacets(userId, "grades")
    const byKey = Object.fromEntries(facets.map((f) => [f.key, f.bookCount]))

    assert.strictEqual(facets.length, 8)
    assert.strictEqual(byKey["S"], 2)
    assert.strictEqual(byKey["C"], 1)
    assert.strictEqual(byKey["A"], 0)
    assert.strictEqual(byKey["F"], 0)
    assert.deepStrictEqual(
      facets.map((f) => f.key),
      ["S", "A", "A-", "B", "B-", "C", "D", "F"],
    )
  })

  void it("statuses: shows every status even with zero books", async () => {
    using ctx = setupTestDb()
    seedUser(ctx.sqlite)

    const [b1] = seedBooks(ctx, [{ title: "one" }])
    const status = ctx.sqlite
      .prepare(`SELECT uuid FROM status WHERE name = 'Reading'`)
      .get() as { uuid: string }
    ctx.sqlite
      .prepare(
        `INSERT INTO book_to_status (book_uuid, status_uuid, user_id) VALUES (?, ?, ?)`,
      )
      .run(b1, status.uuid, userId)

    const facets = await getSectionFacets(userId, "statuses")
    const byName = Object.fromEntries(facets.map((f) => [f.name, f.bookCount]))

    assert.strictEqual(facets.length, 3)
    assert.strictEqual(byName["Reading"], 1)
    assert.strictEqual(byName["To read"], 0)
    assert.strictEqual(byName["Read"], 0)
  })

  void it("shelves: counts manual and smart shelves", async () => {
    using ctx = setupTestDb()
    seedUser(ctx.sqlite)

    const [b1, b2] = seedBooks(ctx, [
      { title: "e", ebook: "e.epub" },
      { title: "plain" },
    ])

    ctx.sqlite
      .prepare(`INSERT INTO shelf (uuid, user_id, name) VALUES (?, ?, ?)`)
      .run("33333333-3333-3333-3333-333333333333", userId, "Manual")
    ctx.sqlite
      .prepare(`INSERT INTO shelf_book (shelf_uuid, book_uuid) VALUES (?, ?)`)
      .run("33333333-3333-3333-3333-333333333333", b1)

    const filter = JSON.stringify({
      type: "and",
      children: [
        {
          type: "condition",
          field: "format",
          operator: "is",
          value: "ebook-only",
        },
      ],
    })
    ctx.sqlite
      .prepare(
        `INSERT INTO shelf (uuid, user_id, name, filter) VALUES (?, ?, ?, ?)`,
      )
      .run("44444444-4444-4444-4444-444444444444", userId, "Smart", filter)

    const facets = await getSectionFacets(userId, "shelves")
    const byName = Object.fromEntries(facets.map((f) => [f.name, f.bookCount]))

    assert.strictEqual(byName["Manual"], 1)
    assert.strictEqual(byName["Smart"], 1)

    void b2
  })
})

void describe("book totals", () => {
  void it("getLibraryCounts.books and countBooks agree with the catalog", async () => {
    using ctx = setupTestDb()
    seedUser(ctx.sqlite)

    const [b1, b2, b3, hidden] = seedBooks(ctx, [
      { title: "one" },
      { title: "two" },
      { title: "three" },
      { title: "hidden" },
    ])
    void b2
    void b3

    ctx.sqlite
      .prepare(`INSERT INTO collection (uuid, name, public) VALUES (?, ?, 0)`)
      .run("55555555-5555-5555-5555-555555555555", "Private")
    ctx.sqlite
      .prepare(
        `INSERT INTO book_to_collection (book_uuid, collection_uuid) VALUES (?, ?)`,
      )
      .run(hidden, "55555555-5555-5555-5555-555555555555")

    const counts = await getLibraryCounts(userId)
    assert.strictEqual(counts.books, 3)

    const all = await countBooks(userId, {})
    assert.strictEqual(all, 3)

    ctx.sqlite
      .prepare(
        `INSERT INTO user_book_rating (user_id, book_uuid, rating) VALUES (?, ?, ?)`,
      )
      .run(userId, b1, 4)

    const rated = await countBooks(userId, {
      filter: {
        type: "and",
        children: [
          { type: "condition", field: "userRating", operator: "isNotEmpty" },
        ],
      },
    })
    assert.strictEqual(rated, 1)
  })
})
