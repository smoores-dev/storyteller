import { getAudioCover, getEpubCover } from "@/assets/covers"
import { optimizeImage } from "@/images"
import { getCachedCoverImage, writeCachedCoverImage } from "@/assets/fs"
import { logger } from "@/logging"
import { db } from "../connection"
import { jsonObjectFrom } from "kysely/helpers/sqlite"
import { BookWithRelations } from "../books"

async function getBooks() {
  return await db
    .selectFrom("book")
    .selectAll("book")
    .select((eb) => [
      jsonObjectFrom(
        eb
          .selectFrom("ebook")
          .select([
            "ebook.uuid",
            "ebook.filepath",
            "ebook.createdAt",
            "ebook.updatedAt",
          ])
          .whereRef("ebook.bookUuid", "=", "book.uuid"),
      ).as("ebook"),
      jsonObjectFrom(
        eb
          .selectFrom("audiobook")
          .select([
            "audiobook.uuid",
            "audiobook.filepath",
            "audiobook.createdAt",
            "audiobook.updatedAt",
          ])
          .whereRef("audiobook.bookUuid", "=", "book.uuid"),
      ).as("audiobook"),
      jsonObjectFrom(
        eb
          .selectFrom("readaloud")
          .select([
            "readaloud.uuid",
            "readaloud.filepath",
            "readaloud.status",
            "readaloud.createdAt",
            "readaloud.updatedAt",
          ])
          .whereRef("readaloud.bookUuid", "=", "book.uuid"),
      ).as("alignedBook"),
    ])
    .execute()
}

export default async function migrate() {
  logger.info("Pre-generating thumbnail images for books...")

  const books = (await getBooks()) as unknown as BookWithRelations[]

  for (const book of books) {
    const cachedAudioCover = await getCachedCoverImage(
      book.uuid,
      "audio",
      147,
      147,
    )
    if (!cachedAudioCover) {
      try {
        const audioCover = await getAudioCover(book)
        if (audioCover) {
          logger.info(`Generating audio thumbnail image for ${book.title}`)
          const optimized = await optimizeImage({
            buffer: audioCover.data,
            height: 147,
            width: 147,
            contentType: audioCover.mimeType,
          })
          audioCover.data = optimized
          await writeCachedCoverImage(book.uuid, "audio", 147, 147, audioCover)
        }
      } catch (e) {
        logger.error(`Failed to generate audiobook thumbnail for ${book.title}`)
        logger.error(e)
      }
    }

    const cachedEbookCover = await getCachedCoverImage(
      book.uuid,
      "text",
      225,
      147,
    )
    if (!cachedEbookCover) {
      try {
        const epubCover = await getEpubCover(book)
        if (epubCover) {
          logger.info(`Generating ebook thumbnail image for ${book.title}`)
          const optimized = await optimizeImage({
            buffer: epubCover.data,
            height: 225,
            width: 147,
            contentType: epubCover.mimeType,
          })

          epubCover.data = optimized
          await writeCachedCoverImage(book.uuid, "text", 225, 147, epubCover)
        }
      } catch (e) {
        logger.error(`Failed to generate ebook thumbnail for ${book.title}`)
        logger.error(e)
      }
    }
  }
}
