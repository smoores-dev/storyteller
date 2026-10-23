import { type Kysely } from "kysely"

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("book")
    .addColumn("textCoverSha256", "text")
    .execute()
  await db.schema
    .alterTable("book")
    .addColumn("audioCoverSha256", "text")
    .execute()
  await db.schema
    .alterTable("book")
    .addColumn("serverUpdatedAt", "text")
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("book").dropColumn("textCoverSha256").execute()
  await db.schema.alterTable("book").dropColumn("audioCoverSha256").execute()
  await db.schema.alterTable("book").dropColumn("serverUpdatedAt").execute()
}
