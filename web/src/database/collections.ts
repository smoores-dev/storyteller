import { Insertable, Selectable, Updateable } from "kysely"
import { DB } from "./schema"
import { db } from "./connection"
import { BookEvents } from "@/events"
import { UUID } from "@/uuid"
import { getBooks } from "./books"
import { jsonArrayFrom } from "kysely/helpers/sqlite"
import { update as updateAutoimport } from "@/assets/autoimport/listen"

export type Collection = Selectable<DB["collection"]>
export type NewCollection = Insertable<DB["collection"]>
export type CollectionUpdate = Updateable<DB["collection"]>

export type CollectionWithRelations = Awaited<ReturnType<typeof getCollection>>

export async function getCollection(uuid: UUID, userId?: UUID) {
  const collection = await db
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

export async function getCollections(userId?: UUID) {
  return await db
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
    .execute()
}

export async function createCollection(
  insert: NewCollection,
  relations: { users?: UUID[] } = {},
) {
  const { uuid } = await db
    .insertInto("collection")
    .values(insert)
    .returning(["uuid as uuid"])
    .executeTakeFirstOrThrow()

  const collection = await getCollection(uuid)

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

  return collection
}

export async function updateCollection(
  uuid: UUID,
  update: CollectionUpdate,
  relations: { users?: UUID[] } = {},
) {
  if (Object.keys(update).length) {
    await db
      .updateTable("collection")
      .set(update)
      .where("uuid", "=", uuid)
      .execute()
  }
  const collection = await getCollection(uuid)

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

  await updateAutoimport(uuid)

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
