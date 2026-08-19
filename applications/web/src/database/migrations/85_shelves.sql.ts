import { sql } from "kysely"

import { db } from "@/database/connection"

export default async function migrate() {
  await db.transaction().execute(async (trx) => {
    await sql`
      CREATE TABLE IF NOT EXISTS shelf (
        uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid()),
        user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        filter TEXT,
        order_by TEXT NOT NULL DEFAULT 'createdAt',
        order_direction TEXT NOT NULL DEFAULT 'desc',
        limit_count INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `.execute(trx)

    await sql`
      CREATE TRIGGER IF NOT EXISTS shelf_update_trigger
      AFTER UPDATE ON shelf FOR EACH ROW
      BEGIN
        UPDATE shelf SET updated_at = CURRENT_TIMESTAMP WHERE uuid = OLD.uuid;
      END
    `.execute(trx)

    await sql`
      CREATE TABLE IF NOT EXISTS shelf_book (
        uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid()),
        shelf_uuid TEXT NOT NULL REFERENCES shelf(uuid) ON DELETE CASCADE,
        book_uuid TEXT NOT NULL REFERENCES book(uuid) ON DELETE CASCADE,
        position INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `.execute(trx)

    await sql`
      CREATE TRIGGER IF NOT EXISTS shelf_book_update_trigger
      AFTER UPDATE ON shelf_book FOR EACH ROW
      BEGIN
        UPDATE shelf_book SET updated_at = CURRENT_TIMESTAMP WHERE uuid = OLD.uuid;
      END
    `.execute(trx)

    await sql`
      CREATE INDEX IF NOT EXISTS idx_shelf_book_shelf ON shelf_book(shelf_uuid)
    `.execute(trx)

    await sql`
      CREATE INDEX IF NOT EXISTS idx_shelf_book_book ON shelf_book(book_uuid)
    `.execute(trx)

    await sql`
      CREATE TABLE IF NOT EXISTS shelf_filter_reference (
        uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid()),
        shelf_uuid TEXT NOT NULL REFERENCES shelf(uuid) ON DELETE CASCADE,
        entity_type TEXT NOT NULL,
        entity_uuid TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `.execute(trx)

    await sql`
      CREATE TRIGGER IF NOT EXISTS shelf_filter_reference_update_trigger
      AFTER UPDATE ON shelf_filter_reference FOR EACH ROW
      BEGIN
        UPDATE shelf_filter_reference SET updated_at = CURRENT_TIMESTAMP WHERE uuid = OLD.uuid;
      END
    `.execute(trx)

    await sql`
      CREATE INDEX IF NOT EXISTS idx_shelf_filter_ref_shelf ON shelf_filter_reference(shelf_uuid)
    `.execute(trx)

    await sql`
      CREATE TABLE IF NOT EXISTS home_shelf (
        uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid()),
        user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        shelf_uuid TEXT REFERENCES shelf(uuid) ON DELETE CASCADE,
        shelf_type TEXT NOT NULL,
        position INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `.execute(trx)

    await sql`
      CREATE TRIGGER IF NOT EXISTS home_shelf_update_trigger
      AFTER UPDATE ON home_shelf FOR EACH ROW
      BEGIN
        UPDATE home_shelf SET updated_at = CURRENT_TIMESTAMP WHERE uuid = OLD.uuid;
      END
    `.execute(trx)

    await sql`
      CREATE INDEX IF NOT EXISTS idx_home_shelf_user ON home_shelf(user_id)
    `.execute(trx)
  })
}
