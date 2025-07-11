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

const DATABASE_URL = join(
  DATA_DIR,
  process.env["STORYTELLER_DB_FILENAME"] ?? "storyteller.db",
)

const UUID_EXT_PATH = join(cwd(), "sqlite", "uuid.c")

mkdirSync(DATA_DIR, { recursive: true })
const sqlite = createDatabase()

sqlite.pragma("journal_mode = WAL")

try {
  sqlite.loadExtension(UUID_EXT_PATH)
} catch (e) {
  logger.error(e)
}

export const db = new Kysely<DB>({
  // log: ["error", "query"],
  dialect: new SqliteDialect({ database: sqlite }),
  plugins: [
    new CamelCasePlugin(),
    new ParseJSONResultsPlugin(),
    new DatePlugin(),
    new BooleanPlugin<DB>({
      fields: [
        "featured",
        "bookCreate",
        "bookDelete",
        "bookDownload",
        "bookList",
        "bookProcess",
        "bookRead",
        "bookUpdate",
        "collectionCreate",
        "inviteDelete",
        "inviteList",
        "settingsUpdate",
        "userCreate",
        "userDelete",
        "userList",
        "userRead",
        "userUpdate",
        "isDefault",
        "public",
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
