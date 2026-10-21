import { type Kysely } from "kysely"

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("book")
    .addColumn("textCoverSha256", "text")
    .addColumn("audioCoverSha256", "text")
    .addColumn("serverUpdatedAt", "text")
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("book")
    .dropColumn("textCoverSha256")
    .dropColumn("audioCoverSha256")
    .dropColumn("serverUpdatedAt")
    .execute()
}
