import { db } from "@/database/connection"
import { logger } from "@/logging"

export default async function migrate() {
  logger.info("Adding book cover_colors_override column")

  const [book] = (await db.introspection.getTables()).filter(
    (table) => table.name === "book",
  )

  if (book?.columns.find((column) => column.name === "cover_colors_override")) {
    return
  }

  await db.schema
    .alterTable("book")
    .addColumn("cover_colors_override", "text")
    .execute()
}
