import assert from "node:assert"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { cwd } from "node:process"

import { sql } from "kysely"
import { describe, it } from "vitest"

import { type TestDbContext, setupTestDb } from "@/__tests__/harness/testDb"
import { bookVisibleTo } from "@/database/shelfFilter"
import { type UUID } from "@/uuid"

const MIGRATION_PATH = join(cwd(), "migrations/127_book_access.sql")
const PERMISSION_UUID = "22222222-2222-2222-2222-222222222222"

async function createFixtures(ctx: TestDbContext) {
  const { db } = ctx
  await db
    .insertInto("userPermission")
    .values({ uuid: PERMISSION_UUID, bookList: true })
    .execute()

  let counter = 0

  return {
    async user() {
      const id = randomUUID()
      await db
        .insertInto("user")
        .values({
          id,
          userPermissionUuid: PERMISSION_UUID,
          email: `${id}@example.com`,
        })
        .execute()
      return id
    },
    async book() {
      counter++
      const { uuid } = await db
        .insertInto("book")
        .values({ title: `Book ${counter}`, assetDir: `book-${counter}` })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return uuid
    },
    async collection(isPublic: boolean) {
      counter++
      const { uuid } = await db
        .insertInto("collection")
        .values({ name: `Collection ${counter}`, public: isPublic })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return uuid
    },
    async addToCollection(bookUuid: UUID, collectionUuid: UUID) {
      await db
        .insertInto("bookToCollection")
        .values({ bookUuid, collectionUuid })
        .onConflict((oc) => oc.doNothing())
        .execute()
    },
    async removeFromCollection(bookUuid: UUID, collectionUuid: UUID) {
      await db
        .deleteFrom("bookToCollection")
        .where("bookUuid", "=", bookUuid)
        .where("collectionUuid", "=", collectionUuid)
        .execute()
    },
    async share(collectionUuid: UUID, userId: UUID) {
      await db
        .insertInto("collectionToUser")
        .values({ collectionUuid, userId })
        .execute()
    },
    async unshare(collectionUuid: UUID, userId: UUID) {
      await db
        .deleteFrom("collectionToUser")
        .where("collectionUuid", "=", collectionUuid)
        .where("userId", "=", userId)
        .execute()
    },
    async setPublic(collectionUuid: UUID, isPublic: boolean) {
      await db
        .updateTable("collection")
        .set({ public: isPublic })
        .where("uuid", "=", collectionUuid)
        .execute()
    },
    async togglePublic(collectionUuid: UUID) {
      await db
        .updateTable("collection")
        .set((eb) => ({ public: eb.not("public") }))
        .where("uuid", "=", collectionUuid)
        .execute()
    },
    async deleteCollection(collectionUuid: UUID) {
      await db
        .deleteFrom("collection")
        .where("uuid", "=", collectionUuid)
        .execute()
    },
    async deleteUser(userId: UUID) {
      await db.deleteFrom("user").where("id", "=", userId).execute()
    },
    async deleteBook(bookUuid: UUID) {
      await db.deleteFrom("book").where("uuid", "=", bookUuid).execute()
    },
  }
}

async function usersWithAccess(ctx: TestDbContext, bookUuid: UUID) {
  const rows = await ctx.db
    .selectFrom("bookAccess")
    .select("userId")
    .where("bookUuid", "=", bookUuid)
    .execute()
  return rows.map((row) => row.userId).sort()
}

/**
 * The materialized table must exactly match the view, in both directions.
 */
async function assertTableMatchesView(ctx: TestDbContext, message?: string) {
  const { db } = ctx
  const view = db.selectFrom("bookAccessView").select(["userId", "bookUuid"])
  const table = db.selectFrom("bookAccess").select(["userId", "bookUuid"])

  const missing = await view.except(table).execute()
  const extra = await table.except(view).execute()
  assert.deepStrictEqual(
    { missing, extra },
    { missing: [], extra: [] },
    message,
  )
}

/**
 * The view must encode the same rule as the query-time visibility check
 * that the rest of the app uses.
 */
async function assertViewMatchesBookVisibleTo(ctx: TestDbContext) {
  const { db } = ctx
  const users = await db.selectFrom("user").select("id").execute()
  for (const { id } of users) {
    const expected = (
      await db
        .selectFrom("book")
        .select("book.uuid")
        .where((eb) => bookVisibleTo(eb, "book.uuid", id))
        .execute()
    )
      .map((row) => row.uuid)
      .sort()
    const actual = (
      await db
        .selectFrom("bookAccessView")
        .select("bookUuid")
        .where("userId", "=", id)
        .execute()
    )
      .map((row) => row.bookUuid)
      .sort()
    assert.deepStrictEqual(actual, expected, `visibility for user ${id}`)
  }
}

describe("book_access", () => {
  it("grants every user access to books with no collections", async () => {
    using ctx = setupTestDb()
    const f = await createFixtures(ctx)
    const alice = await f.user()
    const book = await f.book()
    const bob = await f.user()

    assert.deepStrictEqual(
      await usersWithAccess(ctx, book),
      [alice, bob].sort(),
    )
    await assertTableMatchesView(ctx)
  })

  it("restricts a book to members once it joins a private collection", async () => {
    using ctx = setupTestDb()
    const f = await createFixtures(ctx)
    const alice = await f.user()
    const bob = await f.user()
    const book = await f.book()
    const collection = await f.collection(false)
    await f.share(collection, alice)

    await f.addToCollection(book, collection)
    assert.deepStrictEqual(await usersWithAccess(ctx, book), [alice])

    await f.removeFromCollection(book, collection)
    assert.deepStrictEqual(
      await usersWithAccess(ctx, book),
      [alice, bob].sort(),
    )
    await assertTableMatchesView(ctx)
  })

  it("follows collection membership changes", async () => {
    using ctx = setupTestDb()
    const f = await createFixtures(ctx)
    const alice = await f.user()
    await f.user()
    const book = await f.book()
    const collection = await f.collection(false)
    await f.addToCollection(book, collection)
    assert.deepStrictEqual(await usersWithAccess(ctx, book), [])

    await f.share(collection, alice)
    assert.deepStrictEqual(await usersWithAccess(ctx, book), [alice])

    await f.unshare(collection, alice)
    assert.deepStrictEqual(await usersWithAccess(ctx, book), [])
    await assertTableMatchesView(ctx)
  })

  it("keeps access through another collection when one membership is removed", async () => {
    using ctx = setupTestDb()
    const f = await createFixtures(ctx)
    const alice = await f.user()
    const book = await f.book()
    const first = await f.collection(false)
    const second = await f.collection(false)
    await f.addToCollection(book, first)
    await f.addToCollection(book, second)
    await f.share(first, alice)
    await f.share(second, alice)

    await f.unshare(first, alice)
    assert.deepStrictEqual(await usersWithAccess(ctx, book), [alice])
    await assertTableMatchesView(ctx)
  })

  it("follows a collection's public flag", async () => {
    using ctx = setupTestDb()
    const f = await createFixtures(ctx)
    const alice = await f.user()
    const bob = await f.user()
    const book = await f.book()
    const collection = await f.collection(false)
    await f.share(collection, alice)
    await f.addToCollection(book, collection)

    await f.setPublic(collection, true)
    assert.deepStrictEqual(
      await usersWithAccess(ctx, book),
      [alice, bob].sort(),
    )

    await f.setPublic(collection, false)
    assert.deepStrictEqual(await usersWithAccess(ctx, book), [alice])
    await assertTableMatchesView(ctx)
  })

  it("makes a book public again when its only collection is deleted", async () => {
    using ctx = setupTestDb()
    const f = await createFixtures(ctx)
    const alice = await f.user()
    const bob = await f.user()
    const book = await f.book()
    const collection = await f.collection(false)
    await f.share(collection, alice)
    await f.addToCollection(book, collection)

    await f.deleteCollection(collection)
    assert.deepStrictEqual(
      await usersWithAccess(ctx, book),
      [alice, bob].sort(),
    )
    await assertTableMatchesView(ctx)
  })

  it("gives new users access to public books only", async () => {
    using ctx = setupTestDb()
    const f = await createFixtures(ctx)
    const open = await f.book()
    const restricted = await f.book()
    await f.addToCollection(restricted, await f.collection(false))

    const carol = await f.user()
    assert.deepStrictEqual(await usersWithAccess(ctx, open), [carol])
    assert.deepStrictEqual(await usersWithAccess(ctx, restricted), [])
    await assertTableMatchesView(ctx)
  })

  it("removes access rows when books and users are deleted", async () => {
    using ctx = setupTestDb()
    const f = await createFixtures(ctx)
    const alice = await f.user()
    const bob = await f.user()
    const book = await f.book()
    const other = await f.book()

    await f.deleteBook(book)
    await f.deleteUser(bob)
    assert.deepStrictEqual(await usersWithAccess(ctx, book), [])
    assert.deepStrictEqual(await usersWithAccess(ctx, other), [alice])
    await assertTableMatchesView(ctx)
  })

  it("backfills access for existing data when the migration runs", async () => {
    using ctx = setupTestDb()
    const { db } = ctx
    const triggers = await sql<{ name: string }>`
      SELECT name FROM sqlite_master
      WHERE type = 'trigger' AND sql LIKE '%book_access%'
    `.execute(db)
    for (const { name } of triggers.rows) {
      await sql`DROP TRIGGER ${sql.id(name)}`.execute(db)
    }
    await db.schema.dropView("bookAccessView").execute()
    await db.schema.dropTable("bookAccess").execute()

    const f = await createFixtures(ctx)
    const alice = await f.user()
    await f.user()
    await f.book()
    const restricted = await f.book()
    const collection = await f.collection(false)
    await f.addToCollection(restricted, collection)
    await f.share(collection, alice)

    ctx.sqlite.exec(readFileSync(MIGRATION_PATH, "utf-8"))

    assert.deepStrictEqual(await usersWithAccess(ctx, restricted), [alice])
    await assertTableMatchesView(ctx)
    await assertViewMatchesBookVisibleTo(ctx)
  })
})

/**
 * Small seeded PRNG so that failing fuzz runs can be reproduced.
 */
function mulberry32(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FUZZ_SEEDS = [1, 2, 3, 4, 5]
const FUZZ_STEPS = 1000

const FUZZ_OPS = [
  "addUser",
  "addBook",
  "addCollection",
  "addToCollection",
  "removeFromCollection",
  "share",
  "unshare",
  "togglePublic",
  "deleteCollection",
  "deleteUser",
  "deleteBook",
] as const

describe("book_access fuzzing", () => {
  for (const seed of FUZZ_SEEDS) {
    it(`stays consistent with book_access_view (seed ${seed})`, async () => {
      using ctx = setupTestDb()
      const { db } = ctx
      const f = await createFixtures(ctx)
      const random = mulberry32(seed)
      const pick = <T>(items: readonly T[]) =>
        items[Math.floor(random() * items.length)]

      for (let i = 0; i < 3; i++) {
        await f.user()
        await f.book()
        await f.collection(random() < 0.5)
      }

      const history: string[] = []
      for (let step = 0; step < FUZZ_STEPS; step++) {
        const op = pick(FUZZ_OPS)
        if (!op) continue
        // Sort so that picks depend only on the seed, not on row order
        const users = (await db.selectFrom("user").select("id").execute())
          .map((row) => row.id)
          .sort()
        const books = (await db.selectFrom("book").select("uuid").execute())
          .map((row) => row.uuid)
          .sort()
        const collections = (
          await db.selectFrom("collection").select("uuid").execute()
        )
          .map((row) => row.uuid)
          .sort()
        const user = pick(users)
        const book = pick(books)
        const collection = pick(collections)

        switch (op) {
          case "addUser":
            await f.user()
            break
          case "addBook":
            await f.book()
            break
          case "addCollection":
            await f.collection(random() < 0.5)
            break
          case "addToCollection":
            if (!book || !collection) continue
            await f.addToCollection(book, collection)
            break
          case "removeFromCollection":
            if (!book || !collection) continue
            await f.removeFromCollection(book, collection)
            break
          case "share":
            if (!user || !collection) continue
            await f.share(collection, user)
            break
          case "unshare":
            if (!user || !collection) continue
            await f.unshare(collection, user)
            break
          case "togglePublic":
            if (!collection) continue
            await f.togglePublic(collection)
            break
          case "deleteCollection":
            if (!collection) continue
            await f.deleteCollection(collection)
            break
          case "deleteUser":
            if (!user) continue
            await f.deleteUser(user)
            break
          case "deleteBook":
            if (!book) continue
            await f.deleteBook(book)
            break
        }

        history.push(op)
        await assertTableMatchesView(
          ctx,
          `seed ${seed}, step ${step} (${op}); last ops: ${history.slice(-10).join(", ")}`,
        )
      }

      await assertViewMatchesBookVisibleTo(ctx)
    })
  }
})
