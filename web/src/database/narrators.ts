import { Selectable, Insertable, Updateable } from "kysely"
import { DB } from "./schema"
import { db } from "./connection"

export type Narrator = Selectable<DB["narrator"]>
export type NewNarrator = Insertable<DB["narrator"]>
export type NarratorUpdate = Updateable<DB["narrator"]>

export async function getNarrators() {
  return db.selectFrom("narrator").selectAll().execute()
}
