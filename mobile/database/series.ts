import { type Insertable, type Selectable, type Updateable } from "kysely"

import { type Series as ServerSeries } from "@storyteller-platform/web/src/database/series"

import { type UUID } from "@/uuid"

import { db } from "./db"
import { type DB } from "./schema"

export type Series = Selectable<DB["series"]>
export type NewSeries = Insertable<DB["series"]>
export type SeriesUpdate = Updateable<DB["series"]>

export async function updateSeriesFromServer(serverSeries: ServerSeries) {
  await db.transaction().execute(async (tr) => {
    const existing = await db
      .selectFrom("series")
      .select("uuid")
      .where("uuid", "=", serverSeries.uuid)
      .execute()

    if (existing) {
      await tr
        .updateTable("series")
        .set({
          name: serverSeries.name,
        })
        .where("uuid", "=", serverSeries.uuid)
        .execute()
    }
  })
}

export async function getSeries(uuid: UUID) {
  return await db
    .selectFrom("series")
    .selectAll()
    .where("uuid", "=", uuid)
    .executeTakeFirstOrThrow()
}
