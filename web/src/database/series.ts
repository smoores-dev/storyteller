import { Selectable, Insertable, Updateable } from "kysely"
import { DB } from "./schema"
import { db } from "./connection"

export type Series = Selectable<DB["series"]>
export type NewSeries = Insertable<DB["series"]>
export type SeriesUpdate = Updateable<DB["series"]>

export async function getSeries() {
  return await db.selectFrom("series").selectAll().execute()
}
