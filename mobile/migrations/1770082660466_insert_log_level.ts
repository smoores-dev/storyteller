import { type Kysely } from "kysely"

import { type DB } from "@/database/schema"
import { randomUUID } from "@/uuid"

export async function up(db: Kysely<DB>): Promise<void> {
  await db
    .insertInto("preferences")
    .values({
      uuid: randomUUID(),
      name: "logLevel",
      value: JSON.stringify(__DEV__ ? "info" : "error"),
    })
    .execute()
}

export async function down(db: Kysely<DB>): Promise<void> {
  await db.deleteFrom("preferences").where("name", "=", "logLevel").execute()
}
