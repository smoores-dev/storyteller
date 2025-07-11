import { Insertable, Selectable, Updateable } from "kysely"
import { DB } from "./schema"
import { db } from "./connection"
import { BookEvents } from "@/events"
import { UUID } from "@/uuid"
import { getBooks } from "./books"

export type Collection = Selectable<DB["collection"]>
export type NewCollection = Insertable<DB["collection"]>
export type CollectionUpdate = Updateable<DB["collection"]>

export async function getCollection(uuid: UUID, userId?: UUID) {
  const collection = await db
    .selectFrom("collection")
    .selectAll("collection")
    .leftJoin(
      "bookToCollection",
      "bookToCollection.collectionUuid",
      "collection.uuid",
    )
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

export async function getCollections(userId?: UUID) {
  return await db
    .selectFrom("collection")
    .selectAll("collection")
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
    .execute()
}

export async function createCollection(
  insert: NewCollection,
  relations: { users?: UUID[] } = {},
) {
  const collection = await db
    .insertInto("collection")
    .values(insert)
    .returning([
      "uuid as uuid",
      "name as name",
      "public as public",
      "description as description",
      "createdAt as createdAt",
      "updatedAt as updatedAt",
    ])
    .executeTakeFirstOrThrow()

  if (!collection.public && relations.users) {
    await db
      .insertInto("collectionToUser")
      .values(
        relations.users.map((user) => ({
          collectionUuid: collection.uuid,
          userId: user,
        })),
      )
      .execute()
  }

  return {
    ...collection,
    ...(!collection.public && { users: relations.users }),
  }
}

export async function updateCollection(
  uuid: UUID,
  update: CollectionUpdate,
  relations: { users?: UUID[] } = {},
) {
  const collection = Object.keys(update).length
    ? await db
        .updateTable("collection")
        .set(update)
        .where("uuid", "=", uuid)
        .returning([
          "uuid as uuid",
          "name as name",
          "public as public",
          "description as description",
          "createdAt as createdAt",
          "updatedAt as updatedAt",
        ])
        .executeTakeFirstOrThrow()
    : await getCollection(uuid)

  if (!collection.public && relations.users) {
    await db
      .deleteFrom("collectionToUser")
      .where("collectionUuid", "=", uuid)
      .execute()

    await db
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
    .execute()

  const collections = await getCollections()
  const books = await getBooks(bookUuids)

  books.forEach((book) => {
    BookEvents.emit("message", {
      type: "bookUpdated",
      bookUuid: book.uuid,
      payload: {
        collections: [
          ...book.collections,
          ...collectionUuids
            .map((collectionUuid) =>
              collections.find((c) => c.uuid === collectionUuid),
            )
            .filter((c) => !!c),
        ],
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
        collections: book.collections.filter((c) =>
          collectionUuids.includes(c.uuid),
        ),
      },
    })
  })
}
