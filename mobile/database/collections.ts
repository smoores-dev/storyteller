import { type Insertable, type Selectable, type Updateable } from "kysely"

import { type Collection as ServerCollection } from "@storyteller-platform/web/src/database/collections"

import { type UUID } from "@/uuid"

import { db } from "./db"
import { type DB } from "./schema"

export type Collection = Selectable<DB["collection"]>
export type NewCollection = Insertable<DB["collection"]>
export type CollectionUpdate = Updateable<DB["collection"]>

export async function updateCollectionFromServer(
  serverCollection: ServerCollection,
) {
  await db.transaction().execute(async (tr) => {
    const existing = await db
      .selectFrom("collection")
      .select("uuid")
      .where("uuid", "=", serverCollection.uuid)
      .execute()

    if (existing) {
      await tr
        .updateTable("collection")
        .set({
          name: serverCollection.name,
          description: serverCollection.description,
          public: serverCollection.public,
        })
        .where("uuid", "=", serverCollection.uuid)
        .execute()
    }
  })
}

export async function getCollections() {
  return await db.selectFrom("collection").selectAll().execute()
}

export async function getCollection(uuid: UUID) {
  return await db
    .selectFrom("collection")
    .selectAll()
    .where("uuid", "=", uuid)
    .executeTakeFirstOrThrow()
}
