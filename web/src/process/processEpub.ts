import { UUID } from "@/uuid"
import { extname } from "node:path"
import { Epub } from "@smoores/epub"
import { getEpubFilepath } from "@/assets/paths"
import {
  getCustomEpubCover,
  getEpubCoverFilename,
  getEpubCoverFilepath,
  persistCustomEpubCover,
} from "@/assets/covers"
import { logger } from "@/logging"
import { BookWithRelations } from "@/database/books"

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

export async function writeMetadataToEpub(
  book: BookWithRelations,
  epub: Epub,
  { includeAlignmentMetadata }: { includeAlignmentMetadata?: boolean } = {},
) {
  await epub.setTitle(book.title)
  if (book.language) {
    await epub.setLanguage(new Intl.Locale(book.language))
  }
  const epubAuthors = await epub.getCreators()
  for (let i = 0; i < epubAuthors.length; i++) {
    await epub.removeCreator(i)
  }
  for (const author of book.authors) {
    await epub.addCreator({
      name: author.name,
      fileAs: author.fileAs,
      role: author.role ?? "aut",
    })
  }
  const epubCover = await getCustomEpubCover(book.uuid)
  const epubCoverFilename = await getEpubCoverFilename(book.uuid)
  if (epubCover) {
    const prevCoverItem = await epub.getCoverImageItem()
    await epub.setCoverImage(
      prevCoverItem?.href ?? `images/${epubCoverFilename}`,
      epubCover,
    )
  }

  if (includeAlignmentMetadata) {
    if (book.alignedByStorytellerVersion) {
      await epub.addMetadata({
        type: "meta",
        properties: { property: "storyteller:version" },
        value: book.alignedByStorytellerVersion,
      })
    }

    if (book.alignedAt) {
      await epub.addMetadata({
        type: "meta",
        properties: { property: "storyteller:media-overlays-modified" },
        value: book.alignedAt,
      })
    }

    if (book.alignedWith) {
      await epub.addMetadata({
        type: "meta",
        properties: {
          property: "storyteller:media-overlays-transcription-engine",
        },
        value: book.alignedWith,
      })
    }

    await epub.setPackageVocabularyPrefix(
      "storyteller",
      "https://storyteller-platform.gitlab.io/storyteller/docs/vocabulary",
    )
  }
}
