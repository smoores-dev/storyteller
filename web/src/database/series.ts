import { Selectable, Insertable, Updateable } from "kysely"
import { DB } from "./schema"
import { getDatabase } from "./connection"

export type Series = Selectable<DB["series"]>
export type NewSeries = Insertable<DB["series"]>
export type SeriesUpdate = Updateable<DB["series"]>

export async function getSeries() {
  const db = getDatabase()

  return await db.selectFrom("series").selectAll().execute()
}
