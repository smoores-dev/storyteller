import { sql } from "kysely"

import { db } from "@/database/connection"
import { type UUID } from "@/uuid"

type ImportPathEntry = { path: string; importMode?: string | null }

function normalizeValue(raw: unknown): ImportPathEntry[] | null {
  if (raw === null || raw === undefined || raw === "null") {
    return null
  }

  if (typeof raw === "string") {
    return [{ path: raw }]
  }

  if (!Array.isArray(raw) || raw.length === 0) {
    return null
  }

  return raw.map((item) =>
    typeof item === "string" ? { path: item } : (item as ImportPathEntry),
  )
}

async function normalizeSettingsImportPath() {
  const row = await db
    .selectFrom("settings")
    .select(["value"])
    .where("name", "=", "importPath")
    .executeTakeFirst()

  if (!row) {
    return
  }

  const parsed =
    typeof row.value === "string"
      ? (JSON.parse(row.value) as unknown)
      : row.value

  const normalized = normalizeValue(parsed)
  const serialized = normalized ? JSON.stringify(normalized) : "null"

  if (JSON.stringify(parsed) === serialized) {
    return
  }

  await db
    .updateTable("settings")
    .set({ value: serialized })
    .where("name", "=", "importPath")
    .execute()
}

async function normalizeCollectionImportPaths() {
  // need to do raw selection to avoid pre-deserialization
  const rows = await sql<{
    uuid: UUID
    import_paths: string | null
  }>`SELECT uuid, import_paths FROM collection WHERE import_paths IS NOT NULL`.execute(
    db,
  )

  for (const row of rows.rows) {
    if (!row.import_paths) {
      continue
    }

    const parsed = JSON.parse(row.import_paths) as unknown
    const normalized = normalizeValue(parsed)
    const serialized = normalized ? JSON.stringify(normalized) : null

    if (row.import_paths === serialized) {
      continue
    }

    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable("collection")
        .set({
          importPaths: serialized,
        })
        .where("uuid", "=", row.uuid)
        .execute()
    })
  }
}

export default async function migrate() {
  await normalizeSettingsImportPath()
  await normalizeCollectionImportPaths()
}
