import { Insertable, Selectable, Updateable } from "kysely"
import { DB } from "./schema"
import { getDatabase } from "./connection"

export type Collection = Selectable<DB["collection"]>
export type NewCollection = Insertable<DB["collection"]>
export type CollectionUpdate = Updateable<DB["collection"]>

export async function getCollections(username?: string) {
  const db = getDatabase()

  return await db
    .selectFrom("collection")
    .selectAll("collection")
    .$if(!!username, (qb) =>
      qb
        .leftJoin(
          "collectionToUser",
          "collection.uuid",
          "collectionToUser.collectionUuid",
        )
        .leftJoin("user", "user.uuid", "collectionToUser.userUuid")
        .where((eb) =>
          eb.or([
            // $if ensures that this only runs when username is defined
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            eb("user.username", "=", username!),
            eb("collection.public", "=", true),
          ]),
        ),
    )
    .execute()
}

export async function createCollection(
  insert: NewCollection,
  relations: { users?: string[] } = {},
) {
  const db = getDatabase()

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
          userUuid: user,
        })),
      )
      .execute()
  }

  return {
    ...collection,
    ...(!collection.public && { users: relations.users }),
  }
}
