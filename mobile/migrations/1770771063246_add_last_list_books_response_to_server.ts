import { type Kysely } from "kysely"

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("server")
    .addColumn("lastListBooksResponse", "text")
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("server")
    .dropColumn("lastListBooksResponse")
    .execute()
}
