import { type Insertable, type Selectable, type Updateable } from "kysely"

import { type UUID } from "@/uuid"

import { db } from "./connection"
import { type DB } from "./schema"

export const EXTERNAL_SOURCE_KINDS = ["hardcover", "audible"] as const
export type ExternalSourceKind = (typeof EXTERNAL_SOURCE_KINDS)[number]

export type ExternalSource = Selectable<DB["externalSource"]>
export type NewExternalSource = Insertable<DB["externalSource"]>
export type ExternalSourceUpdate = Updateable<DB["externalSource"]>

export type ExternalData = Selectable<DB["externalData"]>
export type NewExternalData = Insertable<DB["externalData"]>

export async function getExternalSources() {
  return db.selectFrom("externalSource").selectAll().execute()
}

export async function getExternalSource(uuid: UUID) {
  return db
    .selectFrom("externalSource")
    .selectAll()
    .where("uuid", "=", uuid)
    .executeTakeFirstOrThrow()
}

export async function createExternalSource(values: NewExternalSource) {
  return db
    .insertInto("externalSource")
    .values(values)
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function updateExternalSource(
  uuid: UUID,
  update: ExternalSourceUpdate,
) {
  await db
    .updateTable("externalSource")
    .set(update)
    .where("uuid", "=", uuid)
    .execute()
}

export async function deleteExternalSource(uuid: UUID) {
  await db.deleteFrom("externalSource").where("uuid", "=", uuid).execute()
}

export async function upsertExternalData(value: NewExternalData) {
  await db
    .insertInto("externalData")
    .values(value)
    .onConflict((oc) =>
      oc.columns(["identifierUuid", "externalSourceUuid"]).doUpdateSet({
        rating: value.rating,
        fetchedAt: value.fetchedAt,
      }),
    )
    .execute()
}

export async function deleteExternalDataForBook(bookUuid: UUID, uuid: UUID) {
  const result = await db
    .deleteFrom("externalData")
    .where("uuid", "=", uuid)
    .where("identifierUuid", "in", (eb) =>
      eb
        .selectFrom("identifier")
        .select("uuid")
        .where("bookUuid", "=", bookUuid),
    )
    .executeTakeFirst()
  return result.numDeletedRows > 0n
}

export async function getExternalDatasForBook(bookUuid: UUID) {
  return db
    .selectFrom("externalData")
    .innerJoin("identifier", "identifier.uuid", "externalData.identifierUuid")
    .select([
      "externalData.uuid",
      "externalData.identifierUuid",
      "externalData.externalSourceUuid",
      "externalData.rating",
      "externalData.fetchedAt",
    ])
    .where("identifier.bookUuid", "=", bookUuid)
    .execute()
}
