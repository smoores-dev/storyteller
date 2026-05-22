import assert from "node:assert"
import { mkdir, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { describe, it } from "node:test"

import { seedBooks, setupTestDb } from "@/__tests__/harness/testDb"
import { getInternalBookDirectory } from "@/assets/paths"
import { getBook, updateBook } from "@/database/books"
import { ASSETS_DIR } from "@/directories"
import { type UUID } from "@/uuid"

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return false
    }
    throw err
  }
}

void describe("updateBook auto-rename", () => {
  void it("moves the asset folder when title changes", async () => {
    using _db = setupTestDb()
    await rm(ASSETS_DIR, { recursive: true, force: true })
    await mkdir(ASSETS_DIR, { recursive: true })

    const [uuid] = seedBooks(_db, [{ title: "old title" }])
    const book = await getBook(uuid as UUID)
    assert.ok(book, "seeded book should exist")

    // simulate prior pipeline state: a cover file lives inside the book dir.
    const oldDir = getInternalBookDirectory(book)
    await mkdir(oldDir, { recursive: true })
    const oldCover = join(oldDir, "cover.jpg")
    await writeFile(oldCover, "old-cover-bytes")

    const updated = await updateBook(book.uuid, { title: "new title" })
    const newDir = getInternalBookDirectory(updated)

    assert.notStrictEqual(oldDir, newDir, "asset path must change with title")
    assert.strictEqual(
      await exists(oldDir),
      false,
      "old asset dir should be gone after rename",
    )
    assert.ok(
      await exists(join(newDir, "cover.jpg")),
      "cover should follow the book to the new dir",
    )
  })

  void it("leaves the asset folder alone when title is unchanged", async () => {
    using _db = setupTestDb()
    await rm(ASSETS_DIR, { recursive: true, force: true })
    await mkdir(ASSETS_DIR, { recursive: true })

    const [uuid] = seedBooks(_db, [{ title: "keep" }])
    const book = await getBook(uuid as UUID)
    assert.ok(book)
    const dir = getInternalBookDirectory(book)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, "marker"), "x")

    // suffix-only update (the path used by reserveBookDirectory on EEXIST).
    // the asset dir doesn't exist at that point yet, so renameBookAssets
    // would fail. assert no rename is attempted.
    const updated = await updateBook(book.uuid, { description: "x" })
    assert.strictEqual(updated.description, "x")
    assert.ok(await exists(join(dir, "marker")), "marker should not move")
  })
})
