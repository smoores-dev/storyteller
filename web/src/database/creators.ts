import { Selectable, Insertable, Updateable } from "kysely"
import { DB } from "./schema"
import { db } from "./connection"

export type Creator = Selectable<DB["creator"]>
export type NewCreator = Insertable<DB["creator"]>
export type CreatorUpdate = Updateable<DB["creator"]>

export async function getCreators() {
  return db.selectFrom("creator").selectAll().execute()
}
