import {
  type Insertable,
  type Selectable,
  type Transaction,
  type Updateable,
  sql,
} from "kysely"
import { jsonArrayFrom } from "kysely/helpers/sqlite"

import { BookEvents } from "@/events"
import { type UUID } from "@/uuid"

import { getBooks } from "./books"
import { db } from "./connection"
import { type DB } from "./schema"
import { cleanShelfFiltersForDeletedEntity } from "./shelfFilter"

export type Collection = Selectable<DB["collection"]>
export type NewCollection = Insertable<DB["collection"]>
export type CollectionUpdate = Updateable<DB["collection"]>

export type CollectionWithRelations = Awaited<ReturnType<typeof getCollection>>

export async function getCollection(
  uuid: UUID,
  userId?: UUID,
  tr?: Transaction<DB>,
) {
  const collection = await (tr ?? db)
    .selectFrom("collection")
    .selectAll("collection")
    .select((eb) => [
      jsonArrayFrom(
        eb
          .selectFrom("user")
          .innerJoin("collectionToUser", "collectionToUser.userId", "user.id")
          .select(["user.id", "user.email", "user.username"])
          .whereRef("collectionToUser.collectionUuid", "=", "collection.uuid"),
      ).as("users"),
    ])
    .$if(!!userId, (qb) =>
      qb
        .leftJoin(
          "collectionToUser",
          "collection.uuid",
          "collectionToUser.collectionUuid",
        )
        .where((eb) =>
          eb.or([
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            eb("collectionToUser.userId", "=", userId!),
            eb("collection.public", "=", true),
          ]),
        ),
    )
    .where("collection.uuid", "=", uuid)
    .executeTakeFirstOrThrow()

  return collection
}

export type ListOptions = { order?: "asc" | "desc"; limit?: number }

export async function getCollections(
  userId?: UUID,
  { order = "asc", limit }: ListOptions = {},
) {
  const query = db
    .selectFrom("collection")
    .selectAll("collection")
    .select((eb) => [
      jsonArrayFrom(
        eb
          .selectFrom("user")
          .innerJoin("collectionToUser", "collectionToUser.userId", "user.id")
          .select(["user.id", "user.email", "user.username"])
          .whereRef("collectionToUser.collectionUuid", "=", "collection.uuid"),
      ).as("users"),
    ])
    .$if(!!userId, (qb) =>
      qb
        .leftJoin(
          "collectionToUser",
          "collection.uuid",
          "collectionToUser.collectionUuid",
        )
        .where((eb) =>
          eb.or([
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            eb("collectionToUser.userId", "=", userId!),
            eb("collection.public", "=", true),
          ]),
        ),
    )
    .groupBy("collection.uuid")
    .orderBy(sql`collection.name collate nocase`, order)

  return await (limit !== undefined ? query.limit(limit) : query).execute()
}

export async function createCollection(
  input: NewCollection,
  relations: { users?: UUID[] } = {},
) {
  return await db.transaction().execute(async (tr) => {
    const { uuid } = await tr
      .insertInto("collection")
      .values(input)
      .returning(["uuid as uuid"])
      .executeTakeFirstOrThrow()

    const collection = await getCollection(uuid, undefined, tr)

    if (!collection.public && relations.users) {
      await tr
        .insertInto("collectionToUser")
        .values(
          relations.users.map((user) => ({
            collectionUuid: collection.uuid,
            userId: user,
          })),
        )
        .execute()
    }

    return collection
  })
}

export async function updateCollection(
  uuid: UUID,
  input: CollectionUpdate,
  relations: { users?: UUID[] } = {},
) {
  const collection = await db.transaction().execute(async (tr) => {
    if (Object.keys(input).length) {
      await tr
        .updateTable("collection")
        .set(input)
        .where("uuid", "=", uuid)
        .execute()
    }

    const collection = await getCollection(uuid, undefined, tr)

    if (!collection.public && relations.users) {
      await tr
        .deleteFrom("collectionToUser")
        .where("collectionUuid", "=", uuid)
        .execute()

      await tr
        .insertInto("collectionToUser")
        .values(
          relations.users.map((user) => ({
            collectionUuid: collection.uuid,
            userId: user,
          })),
        )
        .execute()
    }

    return collection
  })

  return collection
}

export async function addBooksToCollections(
  collectionUuids: UUID[],
  bookUuids: UUID[],
) {
  await db
    .insertInto("bookToCollection")
    .values(
      collectionUuids.flatMap((collection) =>
        bookUuids.map((book) => ({
          collectionUuid: collection,
          bookUuid: book,
        })),
      ),
    )
    .onConflict((oc) => oc.columns(["bookUuid", "collectionUuid"]).doNothing())
    .execute()

  const collections = await getCollections()
  const books = await getBooks(bookUuids)

  books.forEach((book) => {
    const existingUuids = new Set(book.collections.map((c) => c.uuid))
    const added = collectionUuids
      .filter((collectionUuid) => !existingUuids.has(collectionUuid))
      .map((collectionUuid) =>
        collections.find((c) => c.uuid === collectionUuid),
      )
      .filter((c) => !!c)

    BookEvents.emit("message", {
      type: "bookUpdated",
      bookUuid: book.uuid,
      payload: {
        collections: [...book.collections, ...added],
      },
    })
  })
}

export async function removeBooksFromCollections(
  collectionUuids: UUID[],
  bookUuids: UUID[],
) {
  await db
    .deleteFrom("bookToCollection")
    .where("bookUuid", "in", bookUuids)
    .where("collectionUuid", "in", collectionUuids)
    .execute()

  const books = await getBooks(bookUuids)

  books.forEach((book) => {
    BookEvents.emit("message", {
      type: "bookUpdated",
      bookUuid: book.uuid,
      payload: {
        collections: book.collections.filter(
          (c) => !collectionUuids.includes(c.uuid),
        ),
      },
    })
  })
}

export async function deleteCollection(uuid: UUID, userId: UUID) {
  await db.transaction().execute(async (tr) => {
    const { public: isPublic } = await tr
      .selectFrom("collection")
      .select(["public"])
      .where("uuid", "=", uuid)
      .executeTakeFirstOrThrow()
    const hasPermission = await tr
      .selectFrom("collectionToUser")
      .select(["uuid"])
      .where("collectionUuid", "=", uuid)
      .where("userId", "=", userId)
      .executeTakeFirst()

    if (!isPublic && !hasPermission) return

    await tr
      .deleteFrom("bookToCollection")
      .where("collectionUuid", "=", uuid)
      .execute()

    await tr
      .deleteFrom("collectionToUser")
      .where("collectionToUser.collectionUuid", "=", uuid)
      .execute()

    await tr.deleteFrom("collection").where("uuid", "=", uuid).execute()
  })

  await cleanShelfFiltersForDeletedEntity("collection", uuid)
}

export async function mergeCollections(targetUuid: UUID, sourceUuids: UUID[]) {
  const affectedBookUuids = await db.transaction().execute(async (tr) => {
    const existingLinks = await tr
      .selectFrom("bookToCollection")
      .select(["bookUuid"])
      .where("collectionUuid", "=", targetUuid)
      .execute()

    const existingSet = new Set(existingLinks.map((r) => r.bookUuid))

    const sourceLinks = await tr
      .selectFrom("bookToCollection")
      .select(["bookUuid"])
      .where("collectionUuid", "in", sourceUuids)
      .execute()

    const toInsert = sourceLinks.filter((r) => !existingSet.has(r.bookUuid))

    const uniqueToInsert = [...new Set(toInsert.map((r) => r.bookUuid))]

    if (uniqueToInsert.length > 0) {
      await tr
        .insertInto("bookToCollection")
        .values(
          uniqueToInsert.map((bookUuid) => ({
            bookUuid,
            collectionUuid: targetUuid,
          })),
        )
        .execute()
    }

    await tr
      .deleteFrom("bookToCollection")
      .where("collectionUuid", "in", sourceUuids)
      .execute()

    await tr
      .deleteFrom("collectionToUser")
      .where("collectionUuid", "in", sourceUuids)
      .execute()

    await tr.deleteFrom("collection").where("uuid", "in", sourceUuids).execute()

    return [
      ...new Set([
        ...existingLinks.map((r) => r.bookUuid),
        ...sourceLinks.map((r) => r.bookUuid),
      ]),
    ]
  })

  for (const sourceUuid of sourceUuids) {
    await cleanShelfFiltersForDeletedEntity("collection", sourceUuid)
  }

  if (affectedBookUuids.length > 0) {
    const books = await getBooks(affectedBookUuids)

    books.forEach((book) => {
      BookEvents.emit("message", {
        type: "bookUpdated",
        bookUuid: book.uuid,
        payload: { collections: book.collections },
      })
    })
  }
}
