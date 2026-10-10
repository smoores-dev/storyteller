import { sql } from "kysely"

import { db } from "@/database/connection"
import { logger } from "@/logging"

export default async function migrate() {
  const { rows: columns } = await sql<{ name: string }>`
    SELECT name FROM pragma_table_info('book')
  `.execute(db)

  if (!columns.some((column) => column.name === "release_date")) {
    logger.info("Adding book.release_date")
    await sql`ALTER TABLE book ADD COLUMN release_date TEXT`.execute(db)
  }

  await db.transaction().execute(async (tr) => {
    await sql`
      INSERT OR IGNORE INTO external_source (name, kind, url, color, rating_min, rating_max, rating_icon)
      VALUES ('Audible', 'audible', 'https://www.audible.com', '#F8991C', 0, 5, 'star')
    `.execute(tr)

    await sql`
      INSERT OR IGNORE INTO identifier_type (name, kind)
      VALUES ('Hardcover Book ID', 'hardcover-book-id')
    `.execute(tr)

    for (const [identifierKind, sourceKind] of [
      ["hardcover-book-id", "hardcover"],
      ["audible", "audible"],
    ] as const) {
      await sql`
        UPDATE identifier_type
        SET external_source_uuid = (SELECT uuid FROM external_source WHERE kind = ${sourceKind})
        WHERE kind = ${identifierKind} AND external_source_uuid IS NULL
      `.execute(tr)
    }
  })
}
