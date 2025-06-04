import { Insertable, Selectable, Updateable } from "kysely"
import { DB } from "./schema"
import { db } from "./connection"
import { UUID } from "@/uuid"

export type Collection = Selectable<DB["collection"]>
export type NewCollection = Insertable<DB["collection"]>
export type CollectionUpdate = Updateable<DB["collection"]>

export async function getCollections(userId: UUID) {
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
            eb("collectionToUser.userId", "=", userId),
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
