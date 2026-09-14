import assert from "node:assert"

import { describe, it } from "vitest"

import { seedBooks, setupTestDb } from "@/__tests__/harness/testDb"
import { getSectionFacets } from "@/database/libraryCounts"
import { type UUID } from "@/uuid"

const userId = "11111111-1111-1111-1111-111111111111" as UUID

describe("getSectionFacets formats", () => {
  it("counts every canonical format value, overlapping", async () => {
    using ctx = setupTestDb()

    seedBooks(ctx, [
      { title: "synced", ebook: "e.epub", audiobook: "a.mp3", readaloud: "r" },
      { title: "audio", audiobook: "a.mp3" },
      { title: "book", ebook: "e.epub" },
      { title: "both", ebook: "e.epub", audiobook: "a.mp3" },
      { title: "ronly", readaloud: "r" },
      { title: "empty" },
    ])

    const facets = await getSectionFacets(userId, "formats")
    const byKey = Object.fromEntries(facets.map((f) => [f.key, f.bookCount]))

    assert.strictEqual(byKey["ebook"], 3)
    assert.strictEqual(byKey["audiobook"], 3)
    assert.strictEqual(byKey["readaloud"], 2)
    assert.strictEqual(byKey["ebook-only"], 1)
    assert.strictEqual(byKey["audiobook-only"], 1)
    assert.strictEqual(byKey["readaloud-only"], 1)
    assert.strictEqual(byKey["missing-readaloud"], 1)
    assert.strictEqual(byKey["missing-files"], 0)
    assert.strictEqual(byKey["no-media"], 1)
  })

  it("treats a non-aligned readaloud as missing-readaloud, not no-media", async () => {
    using ctx = setupTestDb()

    const [uuid] = seedBooks(ctx, [
      {
        title: "processing",
        ebook: "e.epub",
        audiobook: "a.mp3",
        readaloud: "r",
      },
    ])
    ctx.sqlite
      .prepare(`UPDATE readaloud SET status = 'PROCESSING' WHERE book_uuid = ?`)
      .run(uuid)

    const facets = await getSectionFacets(userId, "formats")
    const byKey = Object.fromEntries(facets.map((f) => [f.key, f.bookCount]))

    assert.strictEqual(byKey["readaloud"], 0)
    assert.strictEqual(byKey["missing-readaloud"], 1)
    assert.strictEqual(byKey["no-media"], 0)
  })

  it("counts a book with any missing asset file under missing-files", async () => {
    using ctx = setupTestDb()

    const [gone] = seedBooks(ctx, [
      { title: "gone", ebook: "e.epub" },
      { title: "fine", ebook: "e.epub" },
    ])
    ctx.sqlite
      .prepare(`UPDATE ebook SET missing = 1 WHERE book_uuid = ?`)
      .run(gone)

    const facets = await getSectionFacets(userId, "formats")
    const byKey = Object.fromEntries(facets.map((f) => [f.key, f.bookCount]))

    assert.strictEqual(byKey["missing-files"], 1)
    assert.strictEqual(byKey["ebook"], 2)
  })
})
