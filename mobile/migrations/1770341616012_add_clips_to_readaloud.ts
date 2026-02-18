import { type Kysely } from "kysely"

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("readaloud").addColumn("clips", "text").execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("readaloud").dropColumn("clips").execute()
}
