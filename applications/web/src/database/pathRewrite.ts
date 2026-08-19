import { existsSync } from "node:fs"

import { sql } from "kysely"

import { DATA_DIR } from "@/directories"
import { logger } from "@/logging"

import { db } from "./connection"

const PATH_COLUMNS = [
  { table: "ebook", sqlTable: "ebook", column: "filepath" },
  { table: "audiobook", sqlTable: "audiobook", column: "filepath" },
  { table: "readaloud", sqlTable: "readaloud", column: "filepath" },
  { table: "importRule", sqlTable: "import_rule", column: "path" },
] as const

type PathColumn = (typeof PATH_COLUMNS)[number]

const SAMPLE_LIMIT = 20
const EXISTENCE_CHECK_LIMIT = 500

function likePrefix(prefix: string) {
  return `${prefix.replace(/[/%_]/g, "/$&")}%`
}

export type ColumnPreview = {
  table: PathColumn["table"]
  column: PathColumn["column"]
  matchCount: number
  samples: { before: string; after: string; targetExists: boolean }[]
  checkedCount: number
  existingCount: number
}

export type RewritePreview = {
  from: string
  to: string
  columns: ColumnPreview[]
  totalMatches: number
}

export async function previewRewrite(
  from: string,
  to: string,
): Promise<RewritePreview> {
  const columns: ColumnPreview[] = []

  for (const { table, sqlTable, column } of PATH_COLUMNS) {
    const matches = await sql<{ path: string }>`
      select ${sql.ref(column)} as path from ${sql.table(sqlTable)}
      where ${sql.ref(column)} like ${likePrefix(from)} escape '/'
      limit ${sql.lit(EXISTENCE_CHECK_LIMIT)}
    `.execute(db)

    const counted = await sql<{ count: number }>`
      select count(*) as count from ${sql.table(sqlTable)}
      where ${sql.ref(column)} like ${likePrefix(from)} escape '/'
    `.execute(db)
    const count = counted.rows[0]?.count ?? 0

    const rewritten = matches.rows.map(({ path }) => ({
      before: path,
      after: to + path.slice(from.length),
    }))
    const withExistence = rewritten.map((entry) => ({
      ...entry,
      targetExists: existsSync(entry.after),
    }))

    columns.push({
      table,
      column,
      matchCount: count,
      samples: withExistence.slice(0, SAMPLE_LIMIT),
      checkedCount: withExistence.length,
      existingCount: withExistence.filter((entry) => entry.targetExists).length,
    })
  }

  return {
    from,
    to,
    columns,
    totalMatches: columns.reduce((sum, col) => sum + col.matchCount, 0),
  }
}

export type RewriteResult = {
  from: string
  to: string
  updated: { table: string; column: string; count: number }[]
  totalUpdated: number
}

export async function applyRewrite(
  from: string,
  to: string,
): Promise<RewriteResult> {
  const updated = await db.transaction().execute(async (tr) => {
    const results: RewriteResult["updated"] = []
    for (const { table, sqlTable, column } of PATH_COLUMNS) {
      const result = await sql`
        update ${sql.table(sqlTable)}
        set ${sql.ref(column)} = ${to} || substr(${sql.ref(column)}, ${sql.lit(from.length + 1)})
        where ${sql.ref(column)} like ${likePrefix(from)} escape '/'
      `.execute(tr)
      results.push({
        table,
        column,
        count: Number(result.numAffectedRows ?? 0),
      })
    }
    return results
  })

  const totalUpdated = updated.reduce((sum, entry) => sum + entry.count, 0)
  logger.info(
    `Rewrote ${totalUpdated} database paths from "${from}" to "${to}"`,
  )
  return { from, to, updated, totalUpdated }
}

export async function getDataDirAnchor(): Promise<string | null> {
  const row = await db
    .selectFrom("settings")
    .select(["value"])
    .where("name", "=", "dataDirAnchor")
    .orderBy("createdAt", "desc")
    .executeTakeFirst()

  if (!row) return null
  return JSON.parse(row.value) as string | null
}

export async function setDataDirAnchor(value: string): Promise<void> {
  const serialized = JSON.stringify(value)
  await db
    .insertInto("settings")
    .values({ name: "dataDirAnchor", value: serialized })
    .onConflict((oc) => oc.column("name").doUpdateSet({ value: serialized }))
    .execute()
}

export async function ensureDataDirAnchor(): Promise<void> {
  const anchor = await getDataDirAnchor()
  if (anchor === null) {
    await setDataDirAnchor(DATA_DIR)
    return
  }
  if (anchor !== DATA_DIR) {
    logger.warn(
      `This database was last used with data dir "${anchor}" but the current data dir is "${DATA_DIR}" — stored file paths may be stale. Review them in Settings → Data & backups.`,
    )
  }
}
