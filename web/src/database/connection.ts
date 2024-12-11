import { DATA_DIR } from "@/directories"
import { join } from "node:path"
import { cwd } from "node:process"
import Db, { Database } from "better-sqlite3"
import { logger } from "@/logging"

let db: Database | undefined

const DATABASE_URL = join(DATA_DIR, "storyteller.db")

const UUID_EXT_PATH = join(cwd(), "sqlite", "uuid.c")

export function getDatabase(): Database {
  if (db) return db

  db = new Db(DATABASE_URL)
  db.pragma("journal_mode = WAL")
  try {
    db.loadExtension(UUID_EXT_PATH)
  } catch (e) {
    logger.error(e)
  }
  return db
}
