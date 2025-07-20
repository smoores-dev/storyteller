import { Selectable } from "kysely"
import { db } from "./connection"
import { DB } from "./schema"
import { UUID } from "@/uuid"
import { BookEvents } from "@/events"

export type Status = Selectable<DB["status"]>

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
) {
  await db
    .updateTable("book")
    .set({ statusUuid })
    .where("uuid", "in", bookUuids)
    .execute()

  const status = await getStatus(statusUuid)

  bookUuids.forEach((bookUuid) => {
    BookEvents.emit("message", {
      type: "bookUpdated",
      bookUuid,
      payload: {
        status,
        statusUuid,
      },
    })
  })
}
