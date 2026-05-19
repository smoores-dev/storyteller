import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { cwd } from "node:process"

import Db, { type Database } from "better-sqlite3"
import {
  CamelCasePlugin,
  Kysely,
  ParseJSONResultsPlugin,
  SqliteDialect,
} from "kysely"
import { PHASE_PRODUCTION_BUILD } from "next/constants.js"

import { DB_DIR } from "@/directories"
import { env } from "@/env"
import { logger } from "@/logging"

import { BooleanPlugin } from "./plugins/booleanPlugin"
import { DatePlugin } from "./plugins/datePlugin"
import type { DB } from "./schema"

const SKIP_INIT =
  env.NEXT_PHASE === PHASE_PRODUCTION_BUILD ||
  !!process.env["STORYTELLER_TEST_DB"]

const DATABASE_URL = join(
  DB_DIR,
  env.STORYTELLER_DB_FILENAME || "storyteller.db",
)

const UUID_EXT_PATH = join(cwd(), "sqlite", "uuid.c")

let sqlite: Database = null as unknown as Database

if (!SKIP_INIT) {
  mkdirSync(DB_DIR, { recursive: true })
  sqlite = createDatabase()

  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("busy_timeout = 5000")

  try {
    sqlite.loadExtension(UUID_EXT_PATH)
  } catch (e) {
    logger.error(e)
  }
}

export let db: Kysely<DB> = SKIP_INIT
  ? (null as unknown as Kysely<DB>)
  : new Kysely<DB>({
      log(event) {
        if (event.level === "error") {
          logger.error(event.query.sql)
          logger.error(event.error)
        }
      },
      dialect: new SqliteDialect({ database: sqlite }),
      plugins: [
        new CamelCasePlugin(),
        new ParseJSONResultsPlugin(),
        new DatePlugin(),
        new BooleanPlugin<DB>({
          fields: [
            "bookCreate",
            "bookDelete",
            "bookDownload",
            "bookList",
            "bookProcess",
            "bookRead",
            "bookUpdate",
            "collectionCreate",
            "featured",
            "inviteDelete",
            "inviteList",
            "isDefault",
            "missing",
            "public",
            "settingsUpdate",
            "userCreate",
            "userDelete",
            "userList",
            "userRead",
            "userUpdate",
            "restartPending",
          ],
        }),
      ],
    })

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
