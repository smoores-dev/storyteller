import { execSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { cwd } from "node:process"

import Db from "better-sqlite3"

import { replaceDatabase } from "@/database/connection"
import { createKyselyDb } from "@/database/factory"
import { migrate } from "@/database/migrate"
import { logger } from "@/logging"

const SCHEMA_SQL_PATH = join(cwd(), "schema.sql")
const SCHEMA_TS_PATH = join(cwd(), "src", "database", "schema.ts")

function dumpSchemaSql(sqlite: Db.Database): string {
  const rows = sqlite
    .prepare<[], { sql: string }>(
      `SELECT sql FROM sqlite_master
       WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
       ORDER BY rowid`,
    )
    .all()
  return rows.map((r) => `${r.sql};`).join("\n")
}

async function main() {
  const sqlite = new Db(":memory:")

  sqlite.function("uuid", () => randomUUID())
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("busy_timeout = 5000")

  replaceDatabase(createKyselyDb(sqlite))

  logger.info("Running migrations against in-memory database")
  await migrate()

  logger.info(`Writing SQL schema to ${SCHEMA_SQL_PATH}`)
  writeFileSync(SCHEMA_SQL_PATH, dumpSchemaSql(sqlite))

  const tmpDir = mkdtempSync(join(tmpdir(), "storyteller-dump-"))
  const tmpDbPath = join(tmpDir, "schema.db")
  sqlite.exec(`VACUUM INTO '${tmpDbPath.replace(/'/g, "''")}'`)
  sqlite.close()

  try {
    logger.info(`Generating Kysely types at ${SCHEMA_TS_PATH}`)
    execSync("yarn kysely-codegen", {
      env: { ...process.env, DATABASE_URL: tmpDbPath },
      stdio: "inherit",
      cwd: cwd(),
    })
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }

  logger.info("Running prettier on outputs")
  execSync(`yarn prettier --write "${SCHEMA_SQL_PATH}" "${SCHEMA_TS_PATH}"`, {
    stdio: "inherit",
    cwd: join(cwd(), ".."),
  })
}

await main()
