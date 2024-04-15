import { DATA_DIR } from "@/directories"
import { join } from "node:path"
import { cwd } from "node:process"
import { Database } from "sqlite3"

let db: Database | undefined

const DATABASE_URL = join(DATA_DIR, "storyteller.db")

const UUID_EXT_PATH = join(cwd(), "sqlite", "uuid.c")

export async function getDatabase() {
  if (db) return db

  db = await Database.create(DATABASE_URL)
  try {
    await db.loadExtension(UUID_EXT_PATH)
  } catch (e) {
    console.error(e)
  }
  return db
}
