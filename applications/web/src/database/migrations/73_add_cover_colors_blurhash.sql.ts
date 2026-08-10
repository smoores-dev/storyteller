import { getExtractedCover } from "@/assets/covers"
import { db } from "@/database/connection"
import { generateBlurhash, getCoverColors } from "@/images"
import { logger } from "@/logging"

export default async function migrate() {
  logger.info("Generating cover colors")

  const tables = (await db.introspection.getTables()).filter((table) =>
    ["ebook", "audiobook", "readaloud"].includes(table.name),
  )

  for (const table of tables) {
    if (table.columns.find((column) => column.name === "cover_colors")) {
      continue
    }

    await db.schema
      .alterTable(table.name)
      .addColumn("cover_colors", "text")
      .execute()
  }

  for (const table of tables) {
    if (table.columns.find((column) => column.name === "cover_blurhash")) {
      continue
    }

    await db.schema
      .alterTable(table.name)
      .addColumn("cover_blurhash", "text")
      .execute()
  }

  const books = await db.selectFrom("book").selectAll().execute()

  for (const book of books) {
    const [ebookCover, audiobookCover] = await Promise.all([
      getExtractedCover(book, "ebook"),
      getExtractedCover(book, "audiobook"),
    ])

    if (ebookCover) {
      try {
        const colors = getCoverColors(ebookCover.data)
        if (colors) {
          const jsonColors = JSON.stringify(colors)
          await db
            .updateTable("ebook")
            .set({ coverColors: jsonColors })
            .where("bookUuid", "=", book.uuid)
            .execute()

          await db
            .updateTable("readaloud")
            .set({ coverColors: jsonColors })
            .where("bookUuid", "=", book.uuid)
            .execute()
        }
      } catch (error) {
        logger.error({
          msg: `Failed to get cover colors for book ${book.title}`,
          err: error,
        })
      }

      try {
        const blurhash = await generateBlurhash(ebookCover.data)
        if (blurhash) {
          await db
            .updateTable("ebook")
            .set({ coverBlurhash: blurhash })
            .where("bookUuid", "=", book.uuid)
            .execute()

          await db
            .updateTable("readaloud")
            .set({ coverBlurhash: blurhash })
            .where("bookUuid", "=", book.uuid)
            .execute()
        }
      } catch (error) {
        logger.error({
          msg: `Failed to get blurhash for book ${book.title}`,
          err: error,
        })
      }
    }

    if (audiobookCover) {
      try {
        const colors = getCoverColors(audiobookCover.data)
        if (colors) {
          const jsonColors = JSON.stringify(colors)
          await db
            .updateTable("audiobook")
            .set({ coverColors: jsonColors })
            .where("bookUuid", "=", book.uuid)
            .execute()
        }
      } catch (error) {
        logger.error({
          msg: `Failed to get cover colors for book ${book.title}`,
          err: error,
        })
      }

      try {
        const blurhash = await generateBlurhash(audiobookCover.data)
        if (blurhash) {
          await db
            .updateTable("audiobook")
            .set({ coverBlurhash: blurhash })
            .where("bookUuid", "=", book.uuid)
            .execute()
        }
      } catch (error) {
        logger.error({
          msg: `Failed to get blurhash for book ${book.title}`,
          err: error,
        })
      }
    }
  }
}
