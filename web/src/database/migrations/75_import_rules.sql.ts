import { sql } from "kysely"

import { db } from "@/database/connection"
import type { UUID } from "@/uuid"

type ImportPathEntry = { path: string; importMode?: string | null }
type SettingsRow = { value: string }

const hasTable = async (table: string) => {
  const tables = await db.introspection.getTables()
  return tables.some((t) => t.name === table)
}

const hasColumn = async (table: string, column: string) => {
  const tables = await db.introspection.getTables()
  const tableMetadata = tables.find((t) => t.name === table)
  if (!tableMetadata) return false

  return tableMetadata.columns.some((col) => col.name === column)
}

async function createImportRuleTables() {
  await sql`
    CREATE TABLE import_rule (
      uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid()),
      kind TEXT NOT NULL CHECK (kind IN ('watch', 'ignore')),
      path TEXT NOT NULL,
      import_mode TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `.execute(db)

  await sql`
    CREATE UNIQUE INDEX idx_import_rule_path ON import_rule (path)
  `.execute(db)

  await sql`
    CREATE TRIGGER import_rule_update_trigger AFTER
    UPDATE ON "import_rule" FOR EACH ROW BEGIN
    UPDATE "import_rule"
    SET updated_at = CURRENT_TIMESTAMP
    WHERE uuid = OLD.uuid;
    END
  `.execute(db)

  await sql`
    CREATE TABLE import_rule_to_collection (
      import_rule_uuid TEXT NOT NULL REFERENCES import_rule (uuid) ON DELETE CASCADE,
      collection_uuid TEXT NOT NULL REFERENCES collection (uuid) ON DELETE CASCADE,
      PRIMARY KEY (import_rule_uuid, collection_uuid)
    )
  `.execute(db)
}

async function migrateGlobalImportPaths() {
  try {
    const result = await sql<SettingsRow>`
    SELECT value FROM settings WHERE name = 'importPath'
  `.execute(db)

    const row = result.rows[0]
    if (!row) return

    const parsed =
      typeof row.value === "string"
        ? (JSON.parse(row.value) as unknown)
        : row.value

    if (!Array.isArray(parsed) || parsed.length === 0) return

    const entries = parsed as ImportPathEntry[]

    for (const entry of entries) {
      await sql`
      INSERT INTO import_rule (kind, path, import_mode)
      VALUES ('watch', ${entry.path}, ${entry.importMode ?? null})
      ON CONFLICT (path) DO NOTHING
    `.execute(db)
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("no such column: import_paths")
    ) {
      return
    }
    throw error
  }
}

async function migrateCollectionImportPaths() {
  if (!(await hasColumn("collection", "import_paths"))) return

  const result = await sql<{ uuid: UUID; import_paths: string }>`
    SELECT uuid, import_paths FROM collection WHERE import_paths IS NOT NULL
  `.execute(db)

  for (const collection of result.rows) {
    const raw: unknown = collection.import_paths

    const parsed: unknown[] = Array.isArray(raw)
      ? raw
      : typeof raw === "string"
        ? (JSON.parse(raw) as unknown[])
        : []

    if (parsed.length === 0) continue

    // handle both formats: plain strings from migration 73 (json_array)
    // and objects from the application ui
    const entries: ImportPathEntry[] = parsed.map((item) => {
      if (typeof item === "string") return { path: item }
      return item as ImportPathEntry
    })

    for (const entry of entries) {
      if (!entry.path) continue

      await sql`
        INSERT INTO import_rule (kind, path, import_mode)
        VALUES ('watch', ${entry.path}, ${entry.importMode ?? null})
        ON CONFLICT (path) DO NOTHING
      `.execute(db)

      const rule = await sql<{ uuid: UUID }>`
        SELECT uuid FROM import_rule WHERE path = ${entry.path}
      `.execute(db)

      const ruleUuid = rule.rows[0]?.uuid
      if (!ruleUuid) continue

      await sql`
        INSERT INTO import_rule_to_collection (import_rule_uuid, collection_uuid)
        VALUES (${ruleUuid}, ${collection.uuid})
        ON CONFLICT (import_rule_uuid, collection_uuid) DO NOTHING
      `.execute(db)
    }
  }
}

async function migrateSkipPaths() {
  if (!(await hasTable("import_skip_path"))) return

  // only migrate those without a book uuid
  const skipPaths = await sql<{ filepath: string }>`
    SELECT filepath FROM import_skip_path WHERE filepath IS NOT NULL AND book_uuid IS NULL
  `.execute(db)

  for (const row of skipPaths.rows) {
    await sql`
      INSERT INTO import_rule (kind, path)
      VALUES ('ignore', ${row.filepath})
      ON CONFLICT (path) DO NOTHING
    `.execute(db)
  }

  await sql`DROP TABLE IF EXISTS import_skip_path`.execute(db)
}

async function dropCollectionImportPaths() {
  if (!(await hasColumn("collection", "import_paths"))) return

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
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `.execute(trx)

      await sql`
        INSERT INTO collection_new (uuid, name, public, description, created_at, updated_at)
        SELECT uuid, name, public, description, created_at, updated_at
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

async function removeOldSettings() {
  await sql`DELETE FROM settings WHERE name = 'importPath'`.execute(db)
}

async function dropImportRuleTables() {
  // just to reset previous migrations, sorry for the data loss
  await sql`DROP TABLE IF EXISTS import_rule_to_collection`.execute(db)
  await sql`DROP TABLE IF EXISTS import_rule`.execute(db)
}

export default async function migrate() {
  await dropImportRuleTables()
  await createImportRuleTables()
  await migrateGlobalImportPaths()
  await migrateCollectionImportPaths()
  await migrateSkipPaths()
  await dropCollectionImportPaths()
  await removeOldSettings()
}
