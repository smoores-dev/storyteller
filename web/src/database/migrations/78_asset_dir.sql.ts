import { sql } from "kysely"

import { getDefaultSuffix, getSafeFilepathSegment } from "@/assets/paths"
import { db } from "@/database/connection"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

export default async function migrate() {
  const books = await sql<{ uuid: UUID; title: string; suffix: string }>`
    SELECT uuid, title, suffix FROM book
  `
    .execute(db)
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

    await db
      .updateTable("book")
      .set({ assetDir: folder })
      .where("uuid", "=", book.uuid)
      .execute()
  }

  await sql`CREATE UNIQUE INDEX idx_book_asset_dir ON book (asset_dir)`.execute(
    db,
  )
}
