import { randomUUID } from "node:crypto"

import { describe, expect, it } from "vitest"

import { type TestDbContext, setupTestDb } from "@/__tests__/harness/testDb"
import type { DB } from "@/database/schema"
import { type UUID } from "@/uuid"

const PERMISSION_UUID = "33333333-3333-3333-3333-333333333333"

type Fixtures = Awaited<ReturnType<typeof createFixtures>>

async function createFixtures(ctx: TestDbContext) {
  const { db } = ctx
  await db
    .insertInto("userPermission")
    .values({ uuid: PERMISSION_UUID, bookList: true })
    .execute()

  let counter = 0
  const next = () => ++counter

  const fixtures = {
    db,
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
      const n = next()
      const { uuid } = await db
        .insertInto("book")
        .values({ title: `Book ${n}`, assetDir: `book-${n}` })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return uuid
    },
    async collection(isPublic = false) {
      const { uuid } = await db
        .insertInto("collection")
        .values({ name: `Collection ${next()}`, public: isPublic })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return uuid
    },
    async creator() {
      const name = `Creator ${next()}`
      const { uuid } = await db
        .insertInto("creator")
        .values({ name, fileAs: name })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return uuid
    },
    async series() {
      const { uuid } = await db
        .insertInto("series")
        .values({ name: `Series ${next()}` })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return uuid
    },
    async status() {
      const { uuid } = await db
        .insertInto("status")
        .values({ name: `Status ${next()}` })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return uuid
    },
    async tag() {
      const { uuid } = await db
        .insertInto("tag")
        .values({ name: `Tag ${next()}` })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return uuid
    },
    async externalSource() {
      const { uuid } = await db
        .insertInto("externalSource")
        .values({ name: `Source ${next()}` })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return uuid
    },
    async identifierType() {
      const { uuid } = await db
        .insertInto("identifierType")
        .values({ name: `Identifier type ${next()}` })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return uuid
    },
    async identifier(bookUuid: UUID) {
      const identifierTypeUuid = await fixtures.identifierType()
      const { uuid } = await db
        .insertInto("identifier")
        .values({ bookUuid, identifierTypeUuid, value: `${next()}` })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return uuid
    },
    async shelf(userId: UUID) {
      const { uuid } = await db
        .insertInto("shelf")
        .values({ userId, name: `Shelf ${next()}` })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return uuid
    },
    async importRule() {
      const { uuid } = await db
        .insertInto("importRule")
        .values({ kind: "watch", path: `/books/${next()}` })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return uuid
    },
  }

  return fixtures
}

type ExpectedEvent = {
  uuid: string
  userId?: string | null
  bookUuid?: string | null
}

type TableSpec =
  | { exclude: string }
  | { custom: string }
  | {
      key?: "uuid" | "id"
      /** Events for this table are logged without a user_id or book_uuid. */
      unscoped?: true
      insert: (fx: Fixtures) => Promise<ExpectedEvent>
    }

/**
 * Every table and view in the database must be listed here. Because this is
 * checked against the generated `DB` type, adding a table (and running
 * `yarn db:dump`) is a type error until it's given either a spec or an
 * explicit exclusion.
 */
const TABLES = {
  account: { exclude: "auth data, not synced" },
  session: { exclude: "auth data, not synced" },
  verificationToken: { exclude: "auth data, not synced" },
  deviceAuthorization: { exclude: "auth data, not synced" },
  tokenRevokation: { exclude: "auth data, not synced" },
  apiToken: { exclude: "auth data, not synced" },
  serverIdentity: { exclude: "server-internal" },
  migration: { exclude: "server-internal" },
  eventLog: { exclude: "the event log itself" },
  bookAccessView: { exclude: "view; book_access is the materialization" },
  position: { exclude: "not part of the v3 API" },
  progressionHistory: { exclude: "server-internal history, not synced" },
  progressionReference: {
    exclude:
      "materialized into progression documents; the parent progression is always updated alongside it",
  },

  book: {
    custom:
      "insert/delete are surfaced as book_access events rather than book events",
  },
  bookAccess: {
    custom: "maintained by triggers; events use book_uuid as the uuid",
  },
  importRuleToCollection: {
    custom: "no uuid; changes are surfaced as import_rule updates",
  },

  alignmentDecision: {
    async insert(fx) {
      const bookUuid = await fx.book()
      const { uuid } = await fx.db
        .insertInto("alignmentDecision")
        .values({ bookUuid, kind: "chapter", key: "1", decision: "included" })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return { uuid, bookUuid }
    },
  },
  alignmentReport: {
    async insert(fx) {
      const bookUuid = await fx.book()
      const { uuid } = await fx.db
        .insertInto("alignmentReport")
        .values({ bookUuid, grade: "A" })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return { uuid, bookUuid }
    },
  },
  audiobook: {
    async insert(fx) {
      const bookUuid = await fx.book()
      const { uuid } = await fx.db
        .insertInto("audiobook")
        .values({ bookUuid, filepath: "/audio.m4b" })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return { uuid, bookUuid }
    },
  },
  ebook: {
    async insert(fx) {
      const bookUuid = await fx.book()
      const { uuid } = await fx.db
        .insertInto("ebook")
        .values({ bookUuid, filepath: "/book.epub" })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return { uuid, bookUuid }
    },
  },
  readaloud: {
    async insert(fx) {
      const bookUuid = await fx.book()
      const { uuid } = await fx.db
        .insertInto("readaloud")
        .values({ bookUuid, currentStage: "SPLIT_TRACKS" })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return { uuid, bookUuid }
    },
  },
  bookToCollection: {
    async insert(fx) {
      const bookUuid = await fx.book()
      const collectionUuid = await fx.collection()
      const { uuid } = await fx.db
        .insertInto("bookToCollection")
        .values({ bookUuid, collectionUuid })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return { uuid, bookUuid }
    },
  },
  bookToCreator: {
    async insert(fx) {
      const bookUuid = await fx.book()
      const creatorUuid = await fx.creator()
      const { uuid } = await fx.db
        .insertInto("bookToCreator")
        .values({ bookUuid, creatorUuid, role: "aut" })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return { uuid, bookUuid }
    },
  },
  bookToSeries: {
    async insert(fx) {
      const bookUuid = await fx.book()
      const seriesUuid = await fx.series()
      const { uuid } = await fx.db
        .insertInto("bookToSeries")
        .values({ bookUuid, seriesUuid })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return { uuid, bookUuid }
    },
  },
  bookToStatus: {
    async insert(fx) {
      const userId = await fx.user()
      const bookUuid = await fx.book()
      const statusUuid = await fx.status()
      const { uuid } = await fx.db
        .insertInto("bookToStatus")
        .values({ userId, bookUuid, statusUuid })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return { uuid, userId, bookUuid }
    },
  },
  bookToTag: {
    async insert(fx) {
      const bookUuid = await fx.book()
      const tagUuid = await fx.tag()
      const { uuid } = await fx.db
        .insertInto("bookToTag")
        .values({ bookUuid, tagUuid })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return { uuid, bookUuid }
    },
  },
  changelog: {
    unscoped: true,
    async insert(fx) {
      const { uuid } = await fx.db
        .insertInto("changelog")
        .values({
          tagName: "web-v1.0.0",
          version: "1.0.0",
          component: "web",
          releasedAt: "2026-01-01",
        })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      if (!uuid) throw new Error("changelog insert returned no uuid")
      return { uuid }
    },
  },
  collection: {
    unscoped: true,
    async insert(fx) {
      return { uuid: await fx.collection() }
    },
  },
  collectionToUser: {
    async insert(fx) {
      const userId = await fx.user()
      const collectionUuid = await fx.collection()
      const { uuid } = await fx.db
        .insertInto("collectionToUser")
        .values({ userId, collectionUuid })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return { uuid, userId }
    },
  },
  creator: {
    unscoped: true,
    async insert(fx) {
      return { uuid: await fx.creator() }
    },
  },
  externalData: {
    async insert(fx) {
      const bookUuid = await fx.book()
      const identifierUuid = await fx.identifier(bookUuid)
      const externalSourceUuid = await fx.externalSource()
      const { uuid } = await fx.db
        .insertInto("externalData")
        .values({ identifierUuid, externalSourceUuid, rating: 4 })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return { uuid, bookUuid }
    },
  },
  externalSource: {
    unscoped: true,
    async insert(fx) {
      return { uuid: await fx.externalSource() }
    },
  },
  homeSection: {
    async insert(fx) {
      const userId = await fx.user()
      const { uuid } = await fx.db
        .insertInto("homeSection")
        .values({ userId, kind: "currentlyReading", position: 0 })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return { uuid, userId }
    },
  },
  identifier: {
    async insert(fx) {
      const bookUuid = await fx.book()
      return { uuid: await fx.identifier(bookUuid), bookUuid }
    },
  },
  identifierType: {
    unscoped: true,
    async insert(fx) {
      return { uuid: await fx.identifierType() }
    },
  },
  image: {
    unscoped: true,
    async insert(fx) {
      const { uuid } = await fx.db
        .insertInto("image")
        .values({
          sha256: "abc123",
          mimeType: "image/png",
          width: 1,
          height: 1,
          byteSize: 1,
        })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return { uuid }
    },
  },
  importRule: {
    unscoped: true,
    async insert(fx) {
      return { uuid: await fx.importRule() }
    },
  },
  job: {
    async insert(fx) {
      const bookUuid = await fx.book()
      const { uuid } = await fx.db
        .insertInto("job")
        .values({ type: "book_align", bookUuid })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return { uuid, bookUuid }
    },
  },
  progression: {
    async insert(fx) {
      const userId = await fx.user()
      const bookUuid = await fx.book()
      const { uuid } = await fx.db
        .insertInto("progression")
        .values({
          userId,
          bookUuid,
          format: "ebook",
          modified: new Date("2026-01-01T00:00:00Z"),
          deviceId: "device",
          deviceName: "Device",
          progression: 0.5,
        })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return { uuid, userId, bookUuid }
    },
  },
  series: {
    unscoped: true,
    async insert(fx) {
      return { uuid: await fx.series() }
    },
  },
  settings: {
    unscoped: true,
    async insert(fx) {
      // The test harness seeds every setting; make room for an insert
      await fx.db.deleteFrom("settings").where("name", "=", "aligner").execute()
      const { uuid } = await fx.db
        .insertInto("settings")
        .values({ name: "aligner", value: JSON.stringify("whisper") })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return { uuid }
    },
  },
  shelf: {
    async insert(fx) {
      const userId = await fx.user()
      return { uuid: await fx.shelf(userId), userId }
    },
  },
  shelfBook: {
    async insert(fx) {
      const userId = await fx.user()
      const shelfUuid = await fx.shelf(userId)
      const bookUuid = await fx.book()
      const { uuid } = await fx.db
        .insertInto("shelfBook")
        .values({ shelfUuid, bookUuid })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return { uuid, userId, bookUuid }
    },
  },
  shelfFilterReference: {
    async insert(fx) {
      const userId = await fx.user()
      const shelfUuid = await fx.shelf(userId)
      const entityUuid = await fx.tag()
      const { uuid } = await fx.db
        .insertInto("shelfFilterReference")
        .values({ shelfUuid, entityType: "tag", entityUuid })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return { uuid, userId }
    },
  },
  sidebarGroup: {
    async insert(fx) {
      const userId = await fx.user()
      const { uuid } = await fx.db
        .insertInto("sidebarGroup")
        .values({ userId, name: "Group", position: 0 })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return { uuid, userId }
    },
  },
  sidebarItem: {
    async insert(fx) {
      const userId = await fx.user()
      const { uuid } = await fx.db
        .insertInto("sidebarItem")
        .values({ userId, kind: "builtin", builtinKey: "home", position: 0 })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return { uuid, userId }
    },
  },
  status: {
    unscoped: true,
    async insert(fx) {
      return { uuid: await fx.status() }
    },
  },
  tag: {
    unscoped: true,
    async insert(fx) {
      return { uuid: await fx.tag() }
    },
  },
  user: {
    unscoped: true,
    key: "id",
    async insert(fx) {
      return { uuid: await fx.user() }
    },
  },
  userBookRating: {
    async insert(fx) {
      const userId = await fx.user()
      const bookUuid = await fx.book()
      const { uuid } = await fx.db
        .insertInto("userBookRating")
        .values({ userId, bookUuid, rating: 4 })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return { uuid, userId, bookUuid }
    },
  },
  userPermission: {
    unscoped: true,
    async insert(fx) {
      const { uuid } = await fx.db
        .insertInto("userPermission")
        .values({ bookRead: true })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return { uuid }
    },
  },
  userSettings: {
    async insert(fx) {
      const userId = await fx.user()
      const { uuid } = await fx.db
        .insertInto("userSettings")
        .values({ userId, name: "theme", value: "dark" })
        .returning("uuid")
        .executeTakeFirstOrThrow()
      return { uuid, userId }
    },
  },
} satisfies Record<keyof DB, TableSpec>

function toSnakeCase(name: string) {
  return name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}

async function currentSeq(ctx: TestDbContext) {
  const { seq } = await ctx.db
    .selectFrom("eventLog")
    .select((eb) => eb.fn.max("seq").as("seq"))
    .executeTakeFirstOrThrow()
  return seq ?? 0
}

async function eventsSince(
  ctx: TestDbContext,
  since: number,
  tableName: string,
  uuid?: string,
) {
  let query = ctx.db
    .selectFrom("eventLog")
    .select(["op", "uuid", "userId", "bookUuid"])
    .where("seq", ">", since)
    .where("tableName", "=", tableName)
    .orderBy("seq")
  if (uuid) query = query.where("uuid", "=", uuid)
  return query.execute()
}

function event(op: "i" | "u" | "d", expected: ExpectedEvent) {
  return {
    op,
    uuid: expected.uuid,
    userId: expected.userId ?? null,
    bookUuid: expected.bookUuid ?? null,
  }
}

const standardTables = Object.entries(TABLES).flatMap(([name, spec]) =>
  "insert" in spec ? [{ name, tableName: toSnakeCase(name), spec }] : [],
)

/**
 * Event table names whose events are logged without an owner. Events from any
 * other table must carry a user_id or book_uuid.
 */
const unscopedEventTables = new Set([
  ...standardTables.flatMap(({ tableName, spec }) =>
    "unscoped" in spec ? [tableName] : [],
  ),
  // import_rule_to_collection changes are logged as import_rule updates
  "import_rule",
  // collection unpublishing, filtered to non-members in the read path
  "collection_access",
])

type ForeignKey = {
  table: string
  from: string
  to: string | null
  on_delete: string
}

/**
 * Every ON DELETE CASCADE foreign key on a table that has a standard spec, so
 * that each can be exercised by deleting the parent of a freshly inserted row.
 */
const cascades = (() => {
  using ctx = setupTestDb()
  return standardTables.flatMap(({ tableName, spec }) =>
    ctx.sqlite
      .prepare<[], ForeignKey>(`PRAGMA foreign_key_list("${tableName}")`)
      .all()
      .filter((fk) => fk.on_delete === "CASCADE")
      .map((fk) => ({
        tableName,
        spec,
        parent: fk.table,
        from: fk.from,
        to: fk.to,
      })),
  )
})()

describe("event_log", () => {
  it("every table and view is accounted for in TABLES", () => {
    using ctx = setupTestDb()
    const actual = ctx.sqlite
      .prepare<[], { name: string }>(
        `SELECT name FROM sqlite_master
         WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
         ORDER BY name`,
      )
      .all()
      .map((row) => row.name)
    const expected = Object.keys(TABLES).map(toSnakeCase).sort()

    expect(
      actual,
      "Tables in the database don't match TABLES in eventLog.test.ts. " +
        "Give new tables a spec (and event triggers), or an explicit exclusion.",
    ).toStrictEqual(expected)
  })

  describe.each(standardTables)("$tableName", ({ tableName, spec }) => {
    // Generic update/delete go through better-sqlite3 directly so that they
    // work for any table; the primary key column is checked by the assertion
    // that exactly one row changed.
    const key = "key" in spec ? spec.key : "uuid"

    it("logs exactly one event per insert, update and delete", async () => {
      using ctx = setupTestDb()
      const fx = await createFixtures(ctx)

      const beforeInsert = await currentSeq(ctx)
      const expected: ExpectedEvent = await spec.insert(fx)
      expect(
        await eventsSince(ctx, beforeInsert, tableName, expected.uuid),
        "insert",
      ).toStrictEqual([event("i", expected)])

      expect(
        expected.userId != null || expected.bookUuid != null,
        "events must have an owner unless the table is marked unscoped",
      ).toBe(!("unscoped" in spec))

      const beforeUpdate = await currentSeq(ctx)
      const updated = ctx.sqlite
        .prepare(`UPDATE "${tableName}" SET ${key} = ${key} WHERE ${key} = ?`)
        .run(expected.uuid)
      expect(updated.changes, "update should touch one row").toBe(1)
      expect(
        await eventsSince(ctx, beforeUpdate, tableName),
        "update",
      ).toStrictEqual([event("u", expected)])

      const beforeDelete = await currentSeq(ctx)
      const deleted = ctx.sqlite
        .prepare(`DELETE FROM "${tableName}" WHERE ${key} = ?`)
        .run(expected.uuid)
      expect(deleted.changes, "delete should touch one row").toBe(1)
      expect(
        await eventsSince(ctx, beforeDelete, tableName, expected.uuid),
        "delete",
      ).toStrictEqual([event("d", expected)])
    })
  })

  describe.each(cascades)(
    "$tableName cascade from $parent via $from",
    ({ tableName, spec, parent, from, to }) => {
      const key = "key" in spec ? spec.key : "uuid"

      // A cascaded child delete runs after the parent row is gone, so triggers
      // that look up the owner through the parent can't find it. They must
      // either log the correct owner or (since clients delete children along
      // with their parent) log nothing, never an event with a missing owner.
      it("never logs an event with a missing owner", async () => {
        using ctx = setupTestDb()
        const fx = await createFixtures(ctx)
        const expected: ExpectedEvent = await spec.insert(fx)

        const row = ctx.sqlite
          .prepare<[string], Record<string, unknown>>(
            `SELECT "${from}" AS parentKey FROM "${tableName}" WHERE ${key} = ?`,
          )
          .get(expected.uuid)
        const parentKey = row?.["parentKey"]
        if (parentKey == null) return

        const parentColumn =
          to ??
          ctx.sqlite
            .prepare<[], { name: string; pk: number }>(
              `PRAGMA table_info("${parent}")`,
            )
            .all()
            .find((column) => column.pk === 1)?.name
        if (!parentColumn) throw new Error(`${parent} has no primary key`)

        const before = await currentSeq(ctx)
        ctx.sqlite
          .prepare(`DELETE FROM "${parent}" WHERE "${parentColumn}" = ?`)
          .run(parentKey)

        const remaining = ctx.sqlite
          .prepare(`SELECT 1 FROM "${tableName}" WHERE ${key} = ?`)
          .get(expected.uuid)
        expect(remaining, "child row should be cascade-deleted").toBeUndefined()

        const childEvents = await eventsSince(
          ctx,
          before,
          tableName,
          expected.uuid,
        )
        expect(
          childEvents.length === 0 ? [] : childEvents,
          "the cascaded delete should log nothing, or a delete with the correct owner",
        ).toStrictEqual(childEvents.length === 0 ? [] : [event("d", expected)])

        const unowned = await ctx.db
          .selectFrom("eventLog")
          .select(["tableName", "op", "uuid"])
          .where("seq", ">", before)
          .where("userId", "is", null)
          .where("bookUuid", "is", null)
          .execute()
        expect(
          unowned.filter((e) => !unscopedEventTables.has(e.tableName)),
          "only unscoped tables may log events without an owner",
        ).toStrictEqual([])
      })
    },
  )

  describe("book", () => {
    it("surfaces insert and delete as book_access events for each user", async () => {
      using ctx = setupTestDb()
      const fx = await createFixtures(ctx)
      const users = [await fx.user(), await fx.user()].sort()

      const beforeInsert = await currentSeq(ctx)
      const bookUuid = await fx.book()
      expect(await eventsSince(ctx, beforeInsert, "book")).toStrictEqual([])
      const shown = await eventsSince(ctx, beforeInsert, "book_access")
      expect(
        shown.sort((a, b) => (a.userId ?? "").localeCompare(b.userId ?? "")),
      ).toStrictEqual(
        users.map((userId) => event("i", { uuid: bookUuid, userId, bookUuid })),
      )

      const beforeUpdate = await currentSeq(ctx)
      await fx.db
        .updateTable("book")
        .set({ title: "Renamed" })
        .where("uuid", "=", bookUuid)
        .execute()
      expect(await eventsSince(ctx, beforeUpdate, "book")).toStrictEqual([
        event("u", { uuid: bookUuid, bookUuid }),
      ])

      const beforeDelete = await currentSeq(ctx)
      await fx.db.deleteFrom("book").where("uuid", "=", bookUuid).execute()
      expect(await eventsSince(ctx, beforeDelete, "book")).toStrictEqual([])
      const hidden = await eventsSince(ctx, beforeDelete, "book_access")
      expect(
        hidden.sort((a, b) => (a.userId ?? "").localeCompare(b.userId ?? "")),
      ).toStrictEqual(
        users.map((userId) => event("d", { uuid: bookUuid, userId, bookUuid })),
      )
    })
  })

  describe("book_access", () => {
    it("logs show and hide events keyed by book_uuid", async () => {
      using ctx = setupTestDb()
      const fx = await createFixtures(ctx)
      const userId = await fx.user()
      const bookUuid = await fx.book()
      const collectionUuid = await fx.collection(false)
      await fx.db
        .insertInto("bookToCollection")
        .values({ bookUuid, collectionUuid })
        .execute()

      const beforeShare = await currentSeq(ctx)
      await fx.db
        .insertInto("collectionToUser")
        .values({ collectionUuid, userId })
        .execute()
      expect(await eventsSince(ctx, beforeShare, "book_access")).toStrictEqual([
        event("i", { uuid: bookUuid, userId, bookUuid }),
      ])

      const beforeUnshare = await currentSeq(ctx)
      await fx.db
        .deleteFrom("collectionToUser")
        .where("collectionUuid", "=", collectionUuid)
        .where("userId", "=", userId)
        .execute()
      expect(
        await eventsSince(ctx, beforeUnshare, "book_access"),
      ).toStrictEqual([event("d", { uuid: bookUuid, userId, bookUuid })])
    })
  })

  describe("collection_access", () => {
    it("logs a revocation only when a collection is unpublished", async () => {
      using ctx = setupTestDb()
      const fx = await createFixtures(ctx)
      const uuid = await fx.collection(true)

      const beforeRename = await currentSeq(ctx)
      await fx.db
        .updateTable("collection")
        .set({ name: "Renamed" })
        .where("uuid", "=", uuid)
        .execute()
      expect(
        await eventsSince(ctx, beforeRename, "collection_access"),
        "rename",
      ).toStrictEqual([])

      const beforeUnpublish = await currentSeq(ctx)
      await fx.db
        .updateTable("collection")
        .set({ public: false })
        .where("uuid", "=", uuid)
        .execute()
      expect(
        await eventsSince(ctx, beforeUnpublish, "collection"),
        "unpublish still logs a collection update",
      ).toStrictEqual([event("u", { uuid })])
      expect(
        await eventsSince(ctx, beforeUnpublish, "collection_access"),
        "unpublish",
      ).toStrictEqual([event("d", { uuid })])

      const beforePrivateUpdate = await currentSeq(ctx)
      await fx.db
        .updateTable("collection")
        .set({ public: false, name: "Still private" })
        .where("uuid", "=", uuid)
        .execute()
      expect(
        await eventsSince(ctx, beforePrivateUpdate, "collection_access"),
        "updating an already-private collection",
      ).toStrictEqual([])

      const beforePublish = await currentSeq(ctx)
      await fx.db
        .updateTable("collection")
        .set({ public: true })
        .where("uuid", "=", uuid)
        .execute()
      expect(
        await eventsSince(ctx, beforePublish, "collection_access"),
        "publish",
      ).toStrictEqual([])
    })
  })

  describe("import_rule_to_collection", () => {
    it("surfaces membership changes as import_rule updates", async () => {
      using ctx = setupTestDb()
      const fx = await createFixtures(ctx)
      const importRuleUuid = await fx.importRule()
      const collectionUuid = await fx.collection()

      const beforeInsert = await currentSeq(ctx)
      await fx.db
        .insertInto("importRuleToCollection")
        .values({ importRuleUuid, collectionUuid })
        .execute()
      expect(await eventsSince(ctx, beforeInsert, "import_rule")).toStrictEqual(
        [event("u", { uuid: importRuleUuid })],
      )

      const beforeDelete = await currentSeq(ctx)
      await fx.db
        .deleteFrom("importRuleToCollection")
        .where("importRuleUuid", "=", importRuleUuid)
        .where("collectionUuid", "=", collectionUuid)
        .execute()
      expect(await eventsSince(ctx, beforeDelete, "import_rule")).toStrictEqual(
        [event("u", { uuid: importRuleUuid })],
      )
    })
  })
})
