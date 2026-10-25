import { randomUUID } from "node:crypto"
import { mkdirSync } from "node:fs"
import { join } from "node:path"

import Db, { type Database } from "better-sqlite3"
import type { Kysely } from "kysely"
import { PHASE_PRODUCTION_BUILD } from "next/constants.js"

import { DB_DIR } from "@/directories"
import { env } from "@/env"
import { logger } from "@/logging"

import { createKyselyDb } from "./factory"
import type { DB } from "./schema"

const SKIP_INIT =
  env.NEXT_PHASE === PHASE_PRODUCTION_BUILD ||
  !!process.env["STORYTELLER_TEST_DB"]

const DATABASE_URL = join(
  DB_DIR,
  env.STORYTELLER_DB_FILENAME || "storyteller.db",
)

let sqlite: Database = null as unknown as Database

if (!SKIP_INIT) {
  mkdirSync(DB_DIR, { recursive: true })
  sqlite = createDatabase()

  sqlite.function("uuid", () => randomUUID())
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("busy_timeout = 5000")

  // needs to optimize occasionally per connection, bc other
  // connections don't see it
  optimize("optimize = 0x10002")
  setInterval(() => {
    optimize("optimize")
  }, 60 * 60_000).unref()
}

function optimize(pragma: string) {
  try {
    sqlite.pragma(pragma)
  } catch (err) {
    logger.warn({ msg: "Failed to refresh database query planner stats", err })
  }
}

export let db: Kysely<DB> = SKIP_INIT
  ? (null as unknown as Kysely<DB>)
  : createKyselyDb(sqlite)

function createDatabase() {
  return new Db(
    DATABASE_URL,
    env.SQLITE_NATIVE_BINDING
      ? {
          nativeBinding: env.SQLITE_NATIVE_BINDING,
        }
      : undefined,
  )
}

export function replaceDatabase(newDb: Kysely<DB>) {
  db = newDb
}

export async function backupDatabase(destPath: string): Promise<void> {
  await sqlite.backup(destPath)
}
