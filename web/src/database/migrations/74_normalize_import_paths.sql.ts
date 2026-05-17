import { db } from "@/database/connection"

type ImportPathEntry = { path: string; importMode?: string | null }

function normalizeValue(raw: unknown): ImportPathEntry[] | null {
  if (raw === null || raw === undefined || raw === "null") {
    return null
  }

  if (typeof raw === "string") {
    return [{ path: raw, importMode: null }]
  }

  if (!Array.isArray(raw) || raw.length === 0) {
    return null
  }

  return raw.map((item) =>
    typeof item === "string"
      ? { path: item, importMode: null }
      : (item as ImportPathEntry),
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
  const importPaths = await db
    .selectFrom("collection")
    .select(["importPaths", "uuid"])
    .where("importPaths", "is not", null)
    .execute()

  for (const row of importPaths) {
    if (!row.importPaths) {
      continue
    }

    const normalized = normalizeValue(row.importPaths)
    const serialized = normalized ? JSON.stringify(normalized) : null

    // if (row.import_paths === serialized) {
    //   continue
    // }

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
