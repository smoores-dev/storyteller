import { Selectable } from "kysely"
import { DB } from "./schema"
import { getDatabase } from "./connection"

export type Tag = Selectable<DB["tag"]>

export async function getTags() {
  const db = getDatabase()

  return db.selectFrom("tag").selectAll().execute()
}
