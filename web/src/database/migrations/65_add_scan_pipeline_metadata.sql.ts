import { type TableMetadata } from "kysely"

import { db } from "@/database/connection"

const hasColumn = (trx: Transaction, table: string, column: string) => {
  const table = await trx.introspection.getTable(table)
  if (!table) {
    throw new Error(`Table ${table} not found`)
  }
  return table.columns.some((col) => col.name === column)
}
export default async function migrate() {
  await db.transaction().execute(async (trx) => {
    const tables = ["ebook", "audiobook", "readaloud"]
    for (const table of tables) {
      console.log("Checking table", table)
      if (hasColumn(trx, table, "manifest")) {
        console.log("Dropping manifest column from table", table)
        await trx.schema.alterTable(table.name).dropColumn("manifest").execute()
      }

      if (!hasColumn(trx, table, "content_hash")) {
        await trx.schema
          .alterTable(table)
          .addColumn("content_hash", "text")
          .execute()
      }
      if (!hasColumn(trx, table, "manifest")) {
        console.log("Adding manifest column to table", table.name)
        await trx.schema
          .alterTable(table)
          .addColumn("manifest", "jsonb")
          .execute()
      }
      if (hasColumn(trx, table, "positions")) {
        await trx.schema.alterTable(table).dropColumn("positions").execute()
      }
      if (hasColumn(trx, table, "duration")) {
        await trx.schema.alterTable(table).dropColumn("duration").execute()
      }
      if (hasColumn(trx, table, "file_hash")) {
        await trx.schema.alterTable(table).dropColumn("file_hash").execute()
      }
    }
  })
}
