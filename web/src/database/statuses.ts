import { Selectable } from "kysely"
import { db } from "./connection"
import { DB } from "./schema"

export type Status = Selectable<DB["status"]>

export async function getStatuses() {
  return db.selectFrom("status").selectAll().execute()
}

export async function getDefaultStatus() {
  return db
    .selectFrom("status")
    .selectAll("status")
    .where("isDefault", "=", true)
    .executeTakeFirstOrThrow()
}
