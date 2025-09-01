import { DATA_DIR } from "@/directories"
import { join } from "node:path"
import { cwd } from "node:process"
import Db from "better-sqlite3"
import { logger } from "@/logging"
import { mkdirSync } from "node:fs"
import {
  CamelCasePlugin,
  Kysely,
  ParseJSONResultsPlugin,
  SqliteDialect,
} from "kysely"
import { DB } from "./schema"
import { BooleanPlugin } from "./plugins/booleanPlugin"
import { DatePlugin } from "./plugins/datePlugin"
import { PHASE_PRODUCTION_BUILD } from "next/constants.js"
import { Database } from "better-sqlite3"

const DATABASE_URL = join(
  DATA_DIR,
  process.env["STORYTELLER_DB_FILENAME"] ?? "storyteller.db",
)

const UUID_EXT_PATH = join(cwd(), "sqlite", "uuid.c")

mkdirSync(DATA_DIR, { recursive: true })
const sqlite: Database =
  process.env["NEXT_PHASE"] === PHASE_PRODUCTION_BUILD
    ? (null as unknown as Database)
    : createDatabase()

if (process.env["NEXT_PHASE"] !== PHASE_PRODUCTION_BUILD) {
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("busy_timeout = 5000")

  try {
    sqlite.loadExtension(UUID_EXT_PATH)
  } catch (e) {
    logger.error(e)
  }
}

export const db = new Kysely<DB>({
  log(event) {
    // console.log(event.query.sql)
    // console.log(event.query.parameters)
    // console.log(`Completed in ${event.queryDurationMillis}ms`)
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
    process.env["SQLITE_NATIVE_BINDING"]
      ? {
          nativeBinding: process.env["SQLITE_NATIVE_BINDING"],
        }
      : undefined,
  )
}
