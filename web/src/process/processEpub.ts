import { Epub } from "@smoores/epub/node"
import { BookWithRelations } from "@/database/books"
import { extension, lookup } from "mime-types"
import { parseBuffer, selectCover } from "music-metadata"

export async function readEpub(book: BookWithRelations) {
  if (!book.ebook?.filepath) {
    throw new Error(
      `Cannot read EPUB for book ${book.title} (${book.id}): It has no associated ebook record`,
    )
  }
  return Epub.from(book.ebook.filepath)
}

export async function getFullText(epub: Epub) {
  const spine = await epub.getSpineItems()
  const chapterTexts = await Promise.all(
    spine.map((item) => epub.readXhtmlItemContents(item.id, "text")),
  )
  return chapterTexts.join("\n")
}

interface WriteMetadataToEpubOptions {
  includeAlignmentMetadata?: boolean
  textCover?: File
  audioCover?: File
}

async function getAudioCoverItem(epub: Epub) {
  const manifest = await epub.getManifest()
  return Object.values(manifest).find((item) =>
    item.properties?.includes("stoyteller:audio-cover-image"),
  )
}

export async function getAudioCoverImaage(epub: Epub) {
  const coverImageItem = await getAudioCoverItem(epub)
  if (coverImageItem) {
    return epub.readItemContents(coverImageItem.id)
  }

  const manifest = await epub.getManifest()
  // TODO: Would be better to get the first audio file that
  // actually corresponds to a media overlay
  const firstAudioItem = Object.values(manifest).find((item) =>
    item.mediaType?.startsWith("audio/"),
  )
  if (!firstAudioItem) return null

  const audio = await epub.readItemContents(firstAudioItem.id)
  try {
    const { common } = await parseBuffer(audio)
    const coverImage = selectCover(common.picture)
    if (!coverImage) return null

    return coverImage.data
  } catch {
    // Storyteller used to produce audio files with broken metadata
    // that music-metadata couldn't read.
    return null
  }
}

async function setAudioCoverImage(epub: Epub, href: string, data: Uint8Array) {
  const coverImageItem = await getAudioCoverItem(epub)
  if (coverImageItem) {
    await epub.removeManifestItem(coverImageItem.id)
  }
  const mediaType = lookup(href)
  if (!mediaType) {
    throw new Error(`Invalid file extension for cover image: ${href}`)
  }

  await epub.addManifestItem(
    {
      id: "audio-cover-image",
      href,
      mediaType,
      properties: ["storyteller:audio-cover-image"],
    },
    data,
  )
}

export async function writeMetadataToEpub(
  book: BookWithRelations,
  epub: Epub,
  {
    includeAlignmentMetadata,
    textCover,
    audioCover,
  }: WriteMetadataToEpubOptions = {},
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

  if (textCover) {
    const ext = extension(textCover.type)
    const arrayBuffer = await textCover.arrayBuffer()
    const data = new Uint8Array(arrayBuffer)

    const prevCoverItem = await epub.getCoverImageItem()
    await epub.setCoverImage(prevCoverItem?.href ?? `images/cover${ext}`, data)
  }

  if (audioCover) {
    const ext = extension(audioCover.type)
    const arrayBuffer = await audioCover.arrayBuffer()
    const data = new Uint8Array(arrayBuffer)

    const prevCoverItem = await getAudioCoverItem(epub)
    await setAudioCoverImage(
      epub,
      prevCoverItem?.href ?? `images/audio-cover${ext}`,
      data,
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
  }

  await epub.setPackageVocabularyPrefix(
    "storyteller",
    "https://storyteller-platform.gitlab.io/storyteller/docs/vocabulary",
  )
}
