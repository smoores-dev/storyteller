import assert from "node:assert"
import { randomUUID } from "node:crypto"
import { mkdir, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { setTimeout } from "node:timers/promises"

import { describe, it } from "vitest"

import {
  type TestDbContext,
  seedBooks,
  setupTestDb,
} from "@/__tests__/harness/testDb"
import { getInternalBookDirectory } from "@/assets/paths"
import { getBook, updateBook } from "@/database/books"
import { ASSETS_DIR } from "@/directories"
import { type UUID } from "@/uuid"

function seedUser(ctx: TestDbContext): UUID {
  const permission = ctx.sqlite
    .prepare(`INSERT INTO user_permission DEFAULT VALUES RETURNING uuid`)
    .get() as { uuid: string }
  const user = ctx.sqlite
    .prepare(
      `INSERT INTO user (user_permission_uuid, email) VALUES (?, ?) RETURNING id`,
    )
    .get(permission.uuid, `${randomUUID()}@example.com`) as { id: string }
  return user.id as UUID
}

function seedPosition(
  ctx: TestDbContext,
  bookUuid: UUID,
  userId: UUID,
  timestamp: number,
  locator: unknown,
) {
  ctx.sqlite
    .prepare(
      `INSERT INTO position (user_id, book_uuid, locator, timestamp) VALUES (?, ?, ?, ?)`,
    )
    .run(userId, bookUuid, JSON.stringify(locator), timestamp)
}

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

describe("updateBook auto-rename", () => {
  it("moves the asset folder when title changes", async () => {
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

  it("leaves the asset folder alone when title is unchanged", async () => {
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

describe("updateBook merge positions", () => {
  it("keeps the most recent position per user across merged books", async () => {
    using db = setupTestDb()
    const userId = seedUser(db)
    const userId2 = seedUser(db)
    const [targetUuid, mergedUuid] = seedBooks(db, [
      { title: "target" },
      { title: "merged" },
    ]) as [UUID, UUID]

    // target holds an older position, the merged book a newer one.
    seedPosition(db, targetUuid, userId, 100, { href: "old" })
    seedPosition(db, targetUuid, userId2, 101, { href: "old2" })
    // make sure the timestamps are different
    await setTimeout(10)
    seedPosition(db, mergedUuid, userId, 999, { href: "new" })
    seedPosition(db, mergedUuid, userId2, 998, { href: "new2" })

    await updateBook(targetUuid, null, { books: [mergedUuid] }, userId)

    const book = await getBook(targetUuid, userId)
    assert.ok(book?.position, "target should have a position after merge")
    assert.strictEqual(
      book.position.timestamp,
      999,
      "should keep the newest timestamp",
    )
    assert.deepStrictEqual(
      book.position.locator,
      { href: "new" },
      "should keep the newest locator",
    )
    const book2 = await getBook(targetUuid, userId2)
    assert.ok(book2?.position, "target should have a position after merge")
    assert.strictEqual(
      book2.position.timestamp,
      998,
      "should keep the newest timestamp",
    )
    assert.deepStrictEqual(
      book2.position.locator,
      { href: "new2" },
      "should keep the newest locator",
    )
  })

  it("promotes the merged position when target has none", async () => {
    using db = setupTestDb()
    const userId = seedUser(db)
    const [targetUuid, mergedUuid] = seedBooks(db, [
      { title: "target" },
      { title: "merged" },
    ]) as [UUID, UUID]

    // only the merged book has a position
    seedPosition(db, mergedUuid, userId, 555, { href: "only" })

    await updateBook(targetUuid, null, { books: [mergedUuid] }, userId)

    const book = await getBook(targetUuid, userId)
    assert.ok(book?.position, "target should inherit the merged position")
    assert.strictEqual(book.position.timestamp, 555)
    assert.deepStrictEqual(book.position.locator, { href: "only" })
  })

  it("does not crash when only target book has a position", async () => {
    using db = setupTestDb()
    const userId = seedUser(db)
    const [targetUuid, mergedUuid] = seedBooks(db, [
      { title: "target" },
      { title: "merged" },
    ]) as [UUID, UUID]

    // only the target book has a position
    seedPosition(db, targetUuid, userId, 555, { href: "only" })

    await updateBook(targetUuid, null, { books: [mergedUuid] }, userId)

    const book = await getBook(targetUuid, userId)
    assert.ok(book?.position, "target should have a position after merge")
  })
})
