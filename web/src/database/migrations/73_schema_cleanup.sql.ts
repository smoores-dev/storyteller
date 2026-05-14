import { sql } from "kysely"

import { db } from "@/database/connection"

const hasColumn = async (table: string, column: string) => {
  const tables = await db.introspection.getTables()
  const tableMetadata = tables.find((t) => t.name === table)
  if (!tableMetadata) return false

  return tableMetadata.columns.some((col) => col.name === column)
}

const isColumnNullable = async (table: string, column: string) => {
  const tables = await db.introspection.getTables()
  const tableMetadata = tables.find((t) => t.name === table)
  if (!tableMetadata) return false

  const col = tableMetadata.columns.find((c) => c.name === column)
  return col?.isNullable ?? false
}

const hasIndex = async (indexName: string) => {
  const result = await sql<{ name: string }>`
    SELECT name FROM sqlite_master WHERE type = 'index' AND name = ${indexName}
  `.execute(db)

  return result.rows.length > 0
}

async function makeSkipPathNonNullable() {
  const filepathIsNullable = await isColumnNullable(
    "import_skip_path",
    "filepath",
  )
  if (!filepathIsNullable) return

  await db.transaction().execute(async (trx) => {
    await sql`
      CREATE TABLE import_skip_path_new (
        book_uuid TEXT REFERENCES book (uuid),
        filepath TEXT PRIMARY KEY NOT NULL
      )
    `.execute(trx)

    await sql`
      INSERT INTO import_skip_path_new
      SELECT * FROM import_skip_path WHERE filepath IS NOT NULL
    `.execute(trx)

    await sql`DROP TABLE import_skip_path`.execute(trx)
    await sql`ALTER TABLE import_skip_path_new RENAME TO import_skip_path`.execute(
      trx,
    )
  })
}

async function deduplicateSettings() {
  if (await hasIndex("idx_settings_name")) return

  await db.transaction().execute(async (trx) => {
    await sql`
      DELETE FROM settings
      WHERE uuid NOT IN (
        SELECT uuid FROM (
          SELECT uuid, ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at DESC) AS rn
          FROM settings
        ) WHERE rn = 1
      )
    `.execute(trx)

    await sql`CREATE UNIQUE INDEX idx_settings_name ON settings (name)`.execute(
      trx,
    )
  })
}

async function collectionMultipleImportPaths() {
  if (await hasColumn("collection", "import_paths")) return

  await sql`PRAGMA foreign_keys = 0`.execute(db)

  try {
    await db.transaction().execute(async (trx) => {
      await sql`
        CREATE TABLE collection_new (
          uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
          name TEXT NOT NULL UNIQUE,
          public BOOLEAN NOT NULL DEFAULT 0,
          description TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          import_paths TEXT DEFAULT NULL
        )
      `.execute(trx)

      await sql`
        INSERT INTO collection_new (uuid, name, public, description, created_at, updated_at, import_paths)
        SELECT
          uuid, name, public, description, created_at, updated_at,
          CASE WHEN import_path IS NOT NULL THEN json_array(import_path) ELSE NULL END
        FROM collection
      `.execute(trx)

      await sql`DROP TABLE collection`.execute(trx)
      await sql`ALTER TABLE collection_new RENAME TO collection`.execute(trx)

      await sql`
        CREATE TRIGGER collection_update_trigger AFTER
        UPDATE ON "collection" FOR EACH ROW BEGIN
        UPDATE "collection"
        SET updated_at = CURRENT_TIMESTAMP
        WHERE uuid = OLD.uuid;
        END
      `.execute(trx)
    })
  } finally {
    await sql`PRAGMA foreign_keys = 1`.execute(db)
  }
}

export default async function migrate() {
  await makeSkipPathNonNullable()
  await deduplicateSettings()
  await collectionMultipleImportPaths()
}
