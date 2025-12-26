import { type Insertable, type Selectable, type Updateable } from "kysely"

import { type UUID } from "@/uuid"

import { db } from "./db"
import { type DB } from "./schema"

export type Tag = Selectable<DB["tag"]>
export type NewTag = Insertable<DB["tag"]>
export type TagUpdate = Updateable<DB["tag"]>

export async function getTag(uuid: UUID) {
  return await db
    .selectFrom("tag")
    .selectAll()
    .where("uuid", "=", uuid)
    .executeTakeFirstOrThrow()
}
