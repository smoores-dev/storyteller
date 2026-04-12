import { db } from "@/database/connection"

const hasColumn = async (trx: typeof db, table: string, column: string) => {
  const tableMetadata = (await trx.introspection.getTables()).find(
    (t) => t.name === table,
  )
  if (!tableMetadata) {
    throw new Error(`Table ${table} not found`)
  }
  return tableMetadata.columns.some((col) => col.name === column)
}
export default async function migrate() {
  await db.transaction().execute(async (trx) => {
    const tables = ["ebook", "audiobook", "readaloud"]
    for (const table of tables) {
      if (!(await hasColumn(trx, table, "content_hash"))) {
        await trx.schema
          .alterTable(table)
          .addColumn("content_hash", "text")
          .execute()
      }
      if (!(await hasColumn(trx, table, "manifest"))) {
        await trx.schema
          .alterTable(table)
          .addColumn("manifest", "jsonb")
          .execute()
      }
      if (!(await hasColumn(trx, table, "page_count"))) {
        await trx.schema
          .alterTable(table)
          .addColumn("page_count", "integer")
          .execute()
      }
      if (!(await hasColumn(trx, table, "duration"))) {
        await trx.schema
          .alterTable(table)
          .addColumn("duration", "real")
          .execute()
      }
      if (!(await hasColumn(trx, table, "file_size"))) {
        await trx.schema
          .alterTable(table)
          .addColumn("file_size", "integer")
          .execute()
      }
      if (await hasColumn(trx, table, "positions")) {
        await trx.schema.alterTable(table).dropColumn("positions").execute()
      }
      if (await hasColumn(trx, table, "file_hash")) {
        await trx.schema.alterTable(table).dropColumn("file_hash").execute()
      }
    }
  })
}
