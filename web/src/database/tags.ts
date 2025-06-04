import { Selectable } from "kysely"
import { DB } from "./schema"
import { db } from "./connection"

export type Tag = Selectable<DB["tag"]>

export async function getTags() {
  return db.selectFrom("tag").selectAll().execute()
}
