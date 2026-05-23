import { sql } from "kysely"

import { getDefaultSuffix, getSafeFilepathSegment } from "@/assets/paths"
import { db } from "@/database/connection"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

const hasColumn = async (trx: typeof db, table: string, column: string) => {
  const tables = await trx.introspection.getTables()
  const tableMetadata = tables.find((t) => t.name === table)
  if (!tableMetadata) return false

  return tableMetadata.columns.some((col) => col.name === column)
}

export default async function migrate() {
  await db.transaction().execute(async (trx) => {
    if (!(await hasColumn(trx, "book", "asset_dir"))) {
      await sql`
        ALTER TABLE book
        ADD COLUMN asset_dir text NOT NULL DEFAULT '';
      `.execute(trx)

      const books = await sql<{ uuid: UUID; title: string; suffix: string }>`
    SELECT uuid, title, suffix FROM book
  `
        .execute(trx)
        .then((r) => r.rows)

      const seen = new Map<string, string>()

      for (const book of books) {
        let folder = getSafeFilepathSegment(book.title, book.suffix)

        if (seen.has(folder)) {
          logger.warn(
            `asset_dir collision during migration: "${folder}" already used by ${seen.get(folder)}, adding suffix for ${book.uuid}`,
          )
          folder = getSafeFilepathSegment(
            book.title,
            getDefaultSuffix(book.uuid),
          )
        }

        seen.set(folder, book.uuid)

        await trx
          .updateTable("book")
          .set({ assetDir: folder })
          .where("uuid", "=", book.uuid)
          .execute()
      }

      await sql`CREATE UNIQUE INDEX idx_book_asset_dir ON book (asset_dir)`.execute(
        trx,
      )
    }

    if (await hasColumn(trx, "book", "suffix")) {
      await sql`
      ALTER TABLE book
      DROP COLUMN suffix;
      `.execute(trx)
    }
  })
}
