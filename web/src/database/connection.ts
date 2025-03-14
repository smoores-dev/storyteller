import { DATA_DIR } from "@/directories"
import { join } from "node:path"
import { cwd } from "node:process"
import Db, { Database } from "better-sqlite3"
import { logger } from "@/logging"
import { mkdirSync } from "node:fs"

let db: Database | undefined

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

export function getDatabase(): Database {
  if (db) return db

  try {
    db = createDatabase()
  } catch (e) {
    if (
      e instanceof TypeError &&
      e.message === "Cannot open database because the directory does not exist"
    ) {
      mkdirSync(DATA_DIR, { recursive: true })
      db = createDatabase()
    }
    throw e
  }

  db.pragma("journal_mode = WAL")

  try {
    db.loadExtension(UUID_EXT_PATH)
  } catch (e) {
    logger.error(e)
  }
  return db
}
