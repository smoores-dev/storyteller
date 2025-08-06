import { getAudioCover, getEpubCover } from "@/assets/covers"
import { getBooks } from "../books"
import { optimizeImage } from "@/app/api/v2/books/[bookId]/cover/route"
import { getCachedCoverImage, writeCachedCoverImage } from "@/assets/fs"
import { logger } from "@/logging"

export default async function migrate() {
  logger.info("Pre-generating thumbnail images for books...")

  const books = await getBooks()

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
