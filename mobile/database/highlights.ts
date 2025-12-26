import { type Insertable, type Selectable, type Updateable } from "kysely"

import { type UUID } from "@/uuid"

import { db } from "./db"
import { type DB } from "./schema"

export type Highlight = Selectable<DB["highlight"]>
export type HighlightUpdate = Updateable<DB["highlight"]>
export type NewHighlight = Insertable<DB["highlight"]>

export async function getHighlight(uuid: UUID) {
  return (
    (await db
      .selectFrom("highlight")
      .selectAll()
      .where("uuid", "=", uuid)
      .executeTakeFirst()) ?? null
  )
}

export async function getBookHighlights(bookUuid: UUID) {
  return await db
    .selectFrom("highlight")
    .selectAll()
    .where("bookUuid", "=", bookUuid)
    .execute()
}

export async function createHighlight(highlight: NewHighlight) {
  await db.insertInto("highlight").values(highlight).execute()
}

export async function updateHighlight(uuid: UUID, update: HighlightUpdate) {
  await db
    .updateTable("highlight")
    .set(update)
    .where("uuid", "=", uuid)
    .execute()
}

export async function deleteHighlight(uuid: UUID) {
  await db.deleteFrom("highlight").where("uuid", "=", uuid).execute()
}
