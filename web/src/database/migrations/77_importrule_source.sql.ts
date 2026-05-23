// -- tag ignore rules with what created them so the UI can hide the auto-generated
// -- ones and so deleting a book cascades to remove its import-side ignores.

import { sql } from "kysely"

import { db } from "@/database/connection"

const hasColumn = async (table: string, column: string) => {
  const tables = await db.introspection.getTables()
  const tableMetadata = tables.find((t) => t.name === table)
  if (!tableMetadata) return false

  return tableMetadata.columns.some((col) => col.name === column)
}

export default async function migrate() {
  await db.transaction().execute(async (trx) => {
    if (!(await hasColumn("import_rule", "source"))) {
      await sql`
      ALTER TABLE import_rule
      ADD COLUMN source text NOT NULL DEFAULT 'user' CHECK (
        source IN (
          'user',
          'import-relocate',
          'import-backup',
          'prevent-reimport'
        )
      );
    `.execute(db)
    }

    if (!(await hasColumn("import_rule", "book_uuid"))) {
      await sql`
      ALTER TABLE import_rule
      ADD COLUMN book_uuid text DEFAULT NULL REFERENCES book (uuid) ON DELETE CASCADE;
    `.execute(db)
    }

    await sql`
      CREATE INDEX IF NOT EXISTS idx_import_rule_book_uuid ON import_rule (book_uuid)`.execute(
      trx,
    )
  })
}
