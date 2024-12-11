import { UUID } from "@/uuid"
import { extname } from "node:path"
import { Epub } from "@smoores/epub"
import { getEpubFilepath } from "@/assets/paths"
import { getEpubCoverFilepath, persistCustomEpubCover } from "@/assets/covers"
import { logger } from "@/logging"

export async function readEpub(bookUuid: UUID) {
  return Epub.from(getEpubFilepath(bookUuid))
}

export async function getFullText(epub: Epub) {
  const spine = await epub.getSpineItems()
  const chapterTexts = await Promise.all(
    spine.map((item) => epub.readXhtmlItemContents(item.id, "text")),
  )
  return chapterTexts.join("\n")
}

export async function processEpub(bookUuid: UUID) {
  const coverFilepath = await getEpubCoverFilepath(bookUuid)
  if (coverFilepath) return

  const epub = await readEpub(bookUuid)

  try {
    const coverImageItem = await epub.getCoverImageItem()
    if (!coverImageItem) {
      logger.info(
        `Could not find cover image while processing EPUB file for book ${bookUuid}`,
      )
      return
    }

    const fileExtension = extname(coverImageItem.href)

    const coverImage = await epub.readItemContents(coverImageItem.id)

    await persistCustomEpubCover(bookUuid, `Cover${fileExtension}`, coverImage)
  } finally {
    await epub.close()
  }
}
