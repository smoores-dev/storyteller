import { type Insertable, type Updateable } from "kysely"

import { type UUID } from "@/uuid"

import { db } from "./db"
import { type DB } from "./schema"

export type NewPosition = Insertable<DB["position"]>
export type PositionUpdate = Updateable<DB["position"]>

export async function updateBookPosition(
  bookUuid: UUID,
  update: PositionUpdate,
) {
  return await db
    .updateTable("position")
    .set(update)
    .where("bookUuid", "=", bookUuid)
    .execute()
}

export async function getBookPosition(bookUuid: UUID) {
  return await db
    .selectFrom("position")
    .selectAll()
    .where("bookUuid", "=", bookUuid)
    .executeTakeFirst()
}

export async function getPositions() {
  return await db.selectFrom("position").selectAll().execute()
}
