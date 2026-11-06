import assert from "node:assert"

import { describe, it } from "vitest"

import { seedBooks, seedSeries, setupTestDb } from "@/__tests__/harness/testDb"
import { getBooks } from "@/database/books"
import { type UUID } from "@/uuid"

describe("getBooks ordered by series position", () => {
  it("orders books sharing a number oldest added first, then by title", async () => {
    using ctx = setupTestDb()

    const [first, newer, older, sameA, sameB] = seedBooks(ctx, [
      { title: "one" },
      { title: "Two (hardcover)" },
      { title: "two (paperback)" },
      { title: "three (paperback)" },
      { title: "Three (hardcover)" },
    ]) as [string, string, string, string, string]
    // Title order disagrees with when the editions of #2 were added, and the
    // editions of #3 were added in the same second
    const setCreatedAt = ctx.sqlite.prepare(
      `UPDATE book SET created_at = ? WHERE uuid = ?`,
    )
    setCreatedAt.run("2021-01-01 00:00:00", newer)
    setCreatedAt.run("2020-01-01 00:00:00", older)
    setCreatedAt.run("2022-01-01 00:00:00", sameA)
    setCreatedAt.run("2022-01-01 00:00:00", sameB)

    const seriesUuid = seedSeries(ctx, "saga", [
      [first, 1],
      [newer, 2],
      [older, 2],
      [sameA, 3],
      [sameB, 3],
    ])

    const books = await getBooks(null, undefined, {
      series: seriesUuid as UUID,
      orderBy: "seriesPosition",
      orderDirection: "asc",
    })
    assert.deepStrictEqual(
      books.map((b) => b.title),
      [
        "one",
        "two (paperback)",
        "Two (hardcover)",
        "Three (hardcover)",
        "three (paperback)",
      ],
    )
  })
})
