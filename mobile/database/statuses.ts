import { type Selectable } from "kysely"

import { type UUID } from "@/uuid"

import { db } from "./db"
import { type DB } from "./schema"

export type Status = Selectable<DB["status"]>

export function getStatus(uuid: UUID) {
  return db
    .selectFrom("status")
    .selectAll()
    .where("uuid", "=", uuid)
    .executeTakeFirstOrThrow()
}
export function getStatusByName(name: string) {
  return db
    .selectFrom("status")
    .selectAll()
    .where("name", "=", name)
    .executeTakeFirstOrThrow()
}

export function getStatuses() {
  return db.selectFrom("status").selectAll().execute()
}

export function getDirtyStatuses() {
  return db
    .selectFrom("status")
    .selectAll()
    .innerJoin("bookToStatus", "bookToStatus.statusUuid", "status.uuid")
    .select(["bookToStatus.bookUuid", "bookToStatus.dirty"])
    .where("bookToStatus.dirty", "=", "true")
    .execute()
}

export async function setBookStatusClean(bookUuid: UUID) {
  await db
    .updateTable("bookToStatus")
    .set({ dirty: "false" })
    .where("bookUuid", "=", bookUuid)
    .execute()
}
