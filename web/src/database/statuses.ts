import { type Insertable, type Selectable } from "kysely"

import { BookEvents } from "@/events"
import { type UUID } from "@/uuid"

import { db } from "./connection"
import { type DB } from "./schema"

export type Status = Selectable<DB["status"]>
export type NewStatus = Insertable<DB["status"]>

export async function getStatuses() {
  return db.selectFrom("status").selectAll().execute()
}

export async function getStatus(uuid: UUID) {
  return db
    .selectFrom("status")
    .selectAll()
    .where("uuid", "=", uuid)
    .executeTakeFirstOrThrow()
}

export async function getDefaultStatus() {
  return db
    .selectFrom("status")
    .selectAll("status")
    .where("isDefault", "=", true)
    .executeTakeFirstOrThrow()
}

export async function updateStatusForBooks(
  statusUuid: UUID,
  bookUuids: UUID[],
  userId: UUID,
) {
  await db
    .updateTable("bookToStatus")
    .set({ statusUuid })
    .where("bookUuid", "in", bookUuids)
    .where("userId", "=", userId)
    .execute()

  const status = await getStatus(statusUuid)

  bookUuids.forEach((bookUuid) => {
    BookEvents.emit("message", {
      type: "bookUpdated",
      bookUuid,
      payload: {
        status,
      },
    })
  })
}
