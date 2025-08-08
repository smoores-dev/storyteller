import { Epub } from "@smoores/epub/node"
import type {
  AuthorRelation,
  BookRelationsUpdate,
  BookUpdate,
  BookWithRelations,
} from "@/database/books"
import { extension, lookup } from "mime-types"
import { extname } from "node:path"

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
  textCover?: File | undefined
  audioCover?: File | undefined
}

export async function getAudioCoverItem(epub: Epub) {
  const manifest = await epub.getManifest()
  return Object.values(manifest).find((item) =>
    item.properties?.includes("stoyteller:audio-cover-image"),
  )
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

export async function getMetadataFromEpub(epub: Epub): Promise<{
  update: BookUpdate | null
  relations: BookRelationsUpdate
}> {
  let update: BookUpdate | null = null

  const title = await epub.getTitle()
  if (title) {
    update ??= {}
    update.title = title
  }

  const publicationDate = await epub.getPublicationDate()
  if (publicationDate) {
    update ??= {}
    update.publicationDate = publicationDate.toISOString()
  }

  const language = await epub.getLanguage()
  if (language) {
    update ??= {}
    update.language = language.toString()
  }

  const description = await epub.getDescription()
  if (description) {
    update ??= {}
    update.description = description
  }

  const subjects = await epub.getSubjects()
  const tags = subjects.map((subject) =>
    typeof subject === "string" ? subject : subject.value,
  )

  const creators = await epub.getCreators()
  const authors = creators.map<AuthorRelation>((author) => ({
    name: author.name,
    role: author.role ?? null,
    fileAs: author.fileAs ?? author.name,
  }))

  const metadata = await epub.getMetadata()

  const epubCollections = await epub.getCollections()
  const series = epubCollections
    .filter((c) => c.type === "series")
    .map((series, i) => ({
      name: series.name,
      featured: i === 0,
      ...(series.position && { position: parseFloat(series.position) }),
    }))

  const storytellerVersion = await epub.findMetadataItem(
    (item) =>
      item.properties["property"] === "storyteller:version" && !!item.value,
  )
  if (storytellerVersion?.value) {
    update ??= {}
    update.alignedByStorytellerVersion = storytellerVersion.value
  }
  const storytellerMediaOverlaysModified = await epub.findMetadataItem(
    (item) =>
      item.properties["property"] === "storyteller:media-overlays-modified" &&
      !!item.value,
  )
  if (storytellerMediaOverlaysModified?.value) {
    update ??= {}
    update.alignedAt = storytellerMediaOverlaysModified.value
  }
  const storytellerMediaOverlaysEngine = await epub.findMetadataItem(
    (item) =>
      item.properties["property"] === "storyteller:media-overlays-engine" &&
      !!item.value,
  )
  if (storytellerMediaOverlaysEngine?.value) {
    update ??= {}
    update.alignedWith = storytellerMediaOverlaysEngine.value
  }

  for (const entry of metadata) {
    if (entry.properties["name"] === "calibre:series") {
      const name = entry.properties["content"]
      if (!name) continue

      const position = metadata.find(
        (e) => e.properties["name"] === "calibre:series_index",
      )?.properties["content"]

      series.push({
        name: name,
        featured: true,
        ...(position && { position: parseFloat(position) }),
      })
    }
  }

  return {
    update,
    relations: {
      ...(!!tags.length && { tags }),
      ...(!!series.length && { series }),
      ...(!!authors.length && { authors }),
    },
  }
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

  for (const _ of await epub.getCreators()) {
    await epub.removeCreator(0)
  }

  for (const author of book.authors) {
    await epub.addCreator({
      name: author.name,
      ...(author.role && { role: author.role }),
    })
  }

  if (textCover) {
    const ext = textCover.name
      ? extname(textCover.name) || extension(textCover.type)
      : extension(textCover.type)
    const arrayBuffer = await textCover.arrayBuffer()
    const data = new Uint8Array(arrayBuffer)

    const prevCoverItem = await epub.getCoverImageItem()
    await epub.setCoverImage(prevCoverItem?.href ?? `images/cover${ext}`, data)
  }

  if (audioCover) {
    const ext = audioCover.name
      ? extname(audioCover.name) || extension(audioCover.type)
      : extension(audioCover.type)
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

  for (const narrator of book.narrators) {
    await epub.addMetadata({
      type: "meta",
      properties: { property: "storyteller:narrator" },
      value: narrator.name,
    })
  }

  await epub.setPackageVocabularyPrefix(
    "storyteller",
    "https://storyteller-platform.gitlab.io/storyteller/docs/vocabulary",
  )
}
