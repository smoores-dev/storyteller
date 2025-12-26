import { type Insertable, type Selectable, type Updateable } from "kysely"

import { type Creator as ServerCreator } from "@storyteller-platform/web/src/database/creators"

import { type UUID } from "@/uuid"

import { db } from "./db"
import { type DB } from "./schema"

export type Creator = Selectable<DB["creator"]>
export type NewCreator = Insertable<DB["creator"]>
export type CreatorUpdate = Updateable<DB["creator"]>

export async function updateCreatorFromServer(serverCreator: ServerCreator) {
  await db.transaction().execute(async (tr) => {
    const existing = await db
      .selectFrom("creator")
      .select("uuid")
      .where("uuid", "=", serverCreator.uuid)
      .execute()

    if (existing) {
      await tr
        .updateTable("creator")
        .set({
          name: serverCreator.name,
          fileAs: serverCreator.fileAs,
        })
        .where("uuid", "=", serverCreator.uuid)
        .execute()
    }
  })
}

export async function getCreator(uuid: UUID) {
  return await db
    .selectFrom("creator")
    .selectAll()
    .where("uuid", "=", uuid)
    .executeTakeFirstOrThrow()
}
