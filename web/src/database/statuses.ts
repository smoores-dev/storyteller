import { Selectable } from "kysely"
import { getDatabase } from "./connection"
import { DB } from "./schema"

export type Status = Selectable<DB["status"]>

export async function getStatuses() {
  const db = getDatabase()

  return db.selectFrom("status").selectAll().execute()
}
