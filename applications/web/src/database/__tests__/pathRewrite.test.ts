import assert from "node:assert"

import { describe, it } from "vitest"

import { seedBooks, setupTestDb } from "@/__tests__/harness/testDb"
import {
  applyRewrite,
  ensureDataDirAnchor,
  getDataDirAnchor,
  previewRewrite,
  setDataDirAnchor,
} from "@/database/pathRewrite"
import { DATA_DIR } from "@/directories"

describe("path rewrite", () => {
  it("previews matches per column without modifying anything", async () => {
    using ctx = setupTestDb()
    seedBooks(ctx, [
      { title: "A", ebook: "/old/data/assets/a/text/a.epub" },
      { title: "B", audiobook: "/old/data/assets/b/audio/b.m4b" },
      { title: "C", ebook: "/elsewhere/c.epub" },
    ])
    ctx.sqlite
      .prepare(`INSERT INTO import_rule (kind, path) VALUES ('watch', ?)`)
      .run("/old/data/watch")

    const preview = await previewRewrite("/old/data", "/new/data")

    assert.strictEqual(preview.totalMatches, 3)
    const byTable = Object.fromEntries(
      preview.columns.map((col) => [col.table, col]),
    )
    assert.strictEqual(byTable["ebook"]?.matchCount, 1)
    assert.strictEqual(byTable["audiobook"]?.matchCount, 1)
    assert.strictEqual(byTable["readaloud"]?.matchCount, 0)
    assert.strictEqual(byTable["importRule"]?.matchCount, 1)
    assert.strictEqual(
      byTable["ebook"].samples[0]?.after,
      "/new/data/assets/a/text/a.epub",
    )

    const untouched = ctx.sqlite
      .prepare(`SELECT filepath FROM ebook ORDER BY filepath`)
      .all() as { filepath: string }[]
    assert.deepStrictEqual(
      untouched.map((row) => row.filepath),
      ["/elsewhere/c.epub", "/old/data/assets/a/text/a.epub"],
    )
  })

  it("rewrites only paths under the prefix", async () => {
    using ctx = setupTestDb()
    seedBooks(ctx, [
      { title: "A", ebook: "/old/data/assets/a/text/a.epub" },
      { title: "B", ebook: "/elsewhere/b.epub" },
      { title: "C", readaloud: "/old/data/assets/c/aligned/c.epub" },
    ])

    const result = await applyRewrite("/old/data", "/new/data")

    assert.strictEqual(result.totalUpdated, 2)
    const paths = ctx.sqlite
      .prepare(
        `SELECT filepath FROM ebook UNION ALL SELECT filepath FROM readaloud ORDER BY filepath`,
      )
      .all() as { filepath: string }[]
    assert.deepStrictEqual(paths.map((row) => row.filepath).sort(), [
      "/elsewhere/b.epub",
      "/new/data/assets/a/text/a.epub",
      "/new/data/assets/c/aligned/c.epub",
    ])
  })

  it("treats LIKE wildcards in the prefix literally", async () => {
    using ctx = setupTestDb()
    seedBooks(ctx, [
      { title: "A", ebook: "/data_dir/a.epub" },
      { title: "B", ebook: "/dataXdir/b.epub" },
      { title: "C", ebook: "/data%dir/c.epub" },
    ])

    const preview = await previewRewrite("/data_dir", "/moved")
    assert.strictEqual(preview.totalMatches, 1)
    assert.strictEqual(
      preview.columns.find((col) => col.table === "ebook")?.samples[0]?.before,
      "/data_dir/a.epub",
    )

    const percent = await previewRewrite("/data%dir", "/moved")
    assert.strictEqual(percent.totalMatches, 1)
  })

  it("claims and reports the data dir anchor", async () => {
    using ctx = setupTestDb()
    ctx.sqlite
      .prepare(`DELETE FROM settings WHERE name = 'dataDirAnchor'`)
      .run()

    assert.strictEqual(await getDataDirAnchor(), null)

    await ensureDataDirAnchor()
    assert.strictEqual(await getDataDirAnchor(), DATA_DIR)

    await setDataDirAnchor("/somewhere/else")
    assert.strictEqual(await getDataDirAnchor(), "/somewhere/else")

    await ensureDataDirAnchor()
    assert.strictEqual(await getDataDirAnchor(), "/somewhere/else")
  })
})
