import type { Stats } from "node:fs"

import { jsonObjectFrom } from "kysely/helpers/sqlite"

import {
  extractCoverFromAudioFiles,
  extractCoverFromEpub,
} from "@/assets/covers"
import { getCachedCoverImage, writeCachedCoverImage } from "@/assets/fs"
import { db } from "@/database/connection"
import { optimizeImage } from "@/images"
import { logger } from "@/logging"

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

  const books = await getBooks()

  for (const book of books) {
    const audioPath = (book.audiobook as { filepath?: string } | null)?.filepath

    if (audioPath) {
      const cachedAudioCover = await getCachedCoverImage(
        book.uuid,
        "audio",
        147,
        147,
      )

      if (!cachedAudioCover) {
        try {
          const audioCover = await extractCoverFromAudioFiles(audioPath)

          if (audioCover) {
            logger.info(`Generating audio thumbnail image for ${book.title}`)
            const optimized = await optimizeImage({
              buffer: Buffer.from(audioCover.data),
              height: 147,
              width: 147,
              contentType: audioCover.mimeType,
            })

            await writeCachedCoverImage(book.uuid, "audio", 147, 147, {
              filename: audioCover.filename,
              mimeType: audioCover.mimeType,
              stats: { mtimeMs: Date.now(), size: optimized.length } as Stats,
              data: Buffer.from(optimized),
            })
          }
        } catch (e) {
          logger.error(
            `Failed to generate audiobook thumbnail for ${book.title}`,
          )
          logger.error(e)
        }
      }
    }

    const epubPath =
      (book.ebook as { filepath?: string } | null)?.filepath ?? null

    if (epubPath) {
      const cachedEbookCover = await getCachedCoverImage(
        book.uuid,
        "text",
        225,
        147,
      )

      if (!cachedEbookCover) {
        try {
          const epubCover = await extractCoverFromEpub(epubPath)

          if (epubCover) {
            logger.info(`Generating ebook thumbnail image for ${book.title}`)
            const optimized = await optimizeImage({
              buffer: Buffer.from(epubCover.data),
              height: 225,
              width: 147,
              contentType: epubCover.mimeType,
            })

            await writeCachedCoverImage(book.uuid, "text", 225, 147, {
              filename: epubCover.filename,
              mimeType: epubCover.mimeType,
              stats: { mtimeMs: Date.now(), size: optimized.length } as Stats,
              data: Buffer.from(optimized),
            })
          }
        } catch (e) {
          logger.error(`Failed to generate ebook thumbnail for ${book.title}`)
          logger.error(e)
        }
      }
    }
  }
}
