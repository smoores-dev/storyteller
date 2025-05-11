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

let db: Kysely<DB> | undefined

const DATABASE_URL = join(DATA_DIR, "storyteller.db")

const UUID_EXT_PATH = join(cwd(), "sqlite", "uuid.c")

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

export function getDatabase(): Kysely<DB> {
  if (db) return db

  mkdirSync(DATA_DIR, { recursive: true })
  const sqlite = createDatabase()

  sqlite.pragma("journal_mode = WAL")

  try {
    sqlite.loadExtension(UUID_EXT_PATH)
  } catch (e) {
    logger.error(e)
  }

  db = new Kysely<DB>({
    // log: ["error", "query"],
    dialect: new SqliteDialect({ database: sqlite }),
    plugins: [
      new CamelCasePlugin(),
      new ParseJSONResultsPlugin(),
      new BooleanPlugin<DB>({
        fields: [
          "featured",
          "bookRead",
          "bookProcess",
          "bookDownload",
          "bookList",
          "collectionCreate",
          "userCreate",
          "userList",
          "userRead",
          "userDelete",
          "settingsUpdate",
          "bookDelete",
          "bookUpdate",
          "inviteList",
          "inviteDelete",
          "userUpdate",
          "isDefault",
          "public",
        ],
      }),
    ],
  })

  return db
}
