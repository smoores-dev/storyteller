import { readdir } from "node:fs/promises"
import { extname, join } from "node:path"

import { extension, lookup } from "mime-types"

import {
  Audiobook,
  type AudiobookInputs,
  getAttachedImageFromPath,
} from "@storyteller-platform/audiobook"
import { type Epub, type EpubMetadataReader } from "@storyteller-platform/epub"

import { isAudioFile } from "@/audio"
import { type Role, isRole } from "@/components/books/edit/marcRelators"
import {
  type Book,
  type BookRelationsUpdate,
  type BookUpdate,
  type BookWithRelations,
  type CreatorRelation,
} from "@/database/books"
import {
  type MetadataField,
  type MetadataFieldMode,
  type MetadataFieldOverrides,
} from "@/database/settingsTypes"
import { logger } from "@/logging"

import { persistCover } from "./covers"
import { getProcessedAudioFiles } from "./fs"
import { getAudiobookCoverDirectory, getProcessedAudioFilepath } from "./paths"

type ScalarFieldMapping = {
  field: MetadataField
  key: keyof BookUpdate
  isEmpty: (book: Book) => boolean
}

const SCALAR_FIELDS = [
  { field: "title", key: "title", isEmpty: (b) => b.title === "" },
  { field: "subtitle", key: "subtitle", isEmpty: (b) => b.subtitle === null },
  {
    field: "description",
    key: "description",
    isEmpty: (b) => b.description === null,
  },
  { field: "language", key: "language", isEmpty: (b) => b.language === null },
  {
    field: "publicationDate",
    key: "publicationDate",
    isEmpty: (b) => b.publicationDate === null,
  },
] as const satisfies ScalarFieldMapping[]

function shouldIncludeScalar(
  mode: MetadataFieldMode,
  isEmpty: boolean,
): boolean {
  switch (mode) {
    case "skip":
      return false
    case "always":
      return true
    default:
      return isEmpty
  }
}

// merge unions current and extracted, keyed by `keyOf`. extracted items with
// a key that already exists in current are dropped (we never edit a tag to
// rename it, we just add new ones). always overwrites; skip drops the field.
function applyListOverride<C, X>(
  mode: MetadataFieldMode,
  current: C[],
  extracted: X[] | undefined,
  keyOfCurrent: (item: C) => string,
  keyOfExtracted: (item: X) => string,
  toExtracted: (item: C) => X,
): X[] | null {
  const nothingToDo = !extracted?.length && !current.length
  if (mode === "skip" || nothingToDo) {
    return null
  }

  if (mode === "always") {
    return extracted ?? null
  }

  const seen = new Set<string>()
  const out: X[] = []

  for (const item of current) {
    const k = keyOfCurrent(item)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(toExtracted(item))
  }

  for (const item of extracted ?? []) {
    const k = keyOfExtracted(item)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(item)
  }

  return out
}

function creatorKey(name: string, role: string): string {
  return `${role}::${name}`
}

type StoredAuthor = BookWithRelations["authors"][number]
type StoredOtherCreator = BookWithRelations["creators"][number]

function authorToRelation(c: StoredAuthor, role: Role): CreatorRelation {
  return { name: c.name, role, fileAs: c.fileAs || c.name }
}

function otherToRelation(c: StoredOtherCreator): CreatorRelation {
  return {
    name: c.name,
    role: c.role || "oth",
    fileAs: c.fileAs || c.name,
  }
}

export function applyFieldOverrides(
  overrides: MetadataFieldOverrides,
  current: BookWithRelations,
  extracted: BookUpdate | null,
  extractedRelations: BookRelationsUpdate,
): { metadataUpdate: BookUpdate | null; relationUpdate: BookRelationsUpdate } {
  let metadataUpdate: BookUpdate | null = null

  // scalar book fields
  if (extracted) {
    for (const { field, key, isEmpty } of SCALAR_FIELDS) {
      const mode = overrides[field]
      const value = extracted[key]

      if (value !== undefined && shouldIncludeScalar(mode, isEmpty(current))) {
        metadataUpdate ??= {}
        ;(metadataUpdate as Record<string, unknown>)[key] = value
      }
    }
  }

  // alignment fields are always read from the file
  if (extracted) {
    if (extracted.alignedAt !== undefined) {
      metadataUpdate ??= {}
      metadataUpdate.alignedAt = extracted.alignedAt
    }

    if (extracted.alignedByStorytellerVersion !== undefined) {
      metadataUpdate ??= {}
      metadataUpdate.alignedByStorytellerVersion =
        extracted.alignedByStorytellerVersion
    }

    if (extracted.alignedWith !== undefined) {
      metadataUpdate ??= {}
      metadataUpdate.alignedWith = extracted.alignedWith
    }
  }

  const relationUpdate: BookRelationsUpdate = {}

  const incomingAuthors =
    extractedRelations.creators?.filter((c) => c.role === "aut") ?? []
  const incomingNarrators =
    extractedRelations.creators?.filter((c) => c.role === "nrt") ?? []
  const incomingOtherCreators =
    extractedRelations.creators?.filter(
      (c) => c.role !== "aut" && c.role !== "nrt",
    ) ?? []

  const mergedAuthors = applyListOverride(
    overrides.authors,
    current.authors,
    incomingAuthors,
    (c) => creatorKey(c.name, "aut"),
    (c) => creatorKey(c.name, "aut"),
    (c) => authorToRelation(c, "aut"),
  )
  const mergedNarrators = applyListOverride(
    overrides.narrators,
    current.narrators,
    incomingNarrators,
    (c) => creatorKey(c.name, "nrt"),
    (c) => creatorKey(c.name, "nrt"),
    (c) => authorToRelation(c, "nrt"),
  )
  const mergedOthers = applyListOverride(
    overrides.creators,
    current.creators,
    incomingOtherCreators,
    (c) => creatorKey(c.name, c.role ?? ""),
    (c) => creatorKey(c.name, c.role ?? ""),
    (c) => otherToRelation(c),
  )

  const anyCreatorPatch =
    mergedAuthors !== null || mergedNarrators !== null || mergedOthers !== null
  if (anyCreatorPatch) {
    const next: CreatorRelation[] = [
      ...(mergedAuthors ??
        current.authors.map((c) => authorToRelation(c, "aut"))),
      ...(mergedNarrators ??
        current.narrators.map((c) => authorToRelation(c, "nrt"))),
      ...(mergedOthers ?? current.creators.map((c) => otherToRelation(c))),
    ]
    relationUpdate.creators = next
  }

  const mergedSeries = applyListOverride(
    overrides.series,
    current.series,
    extractedRelations.series,
    (s) => s.name,
    (s) => s.name,
    (s) => ({
      name: s.name,
      featured: s.featured,
      ...(s.position !== null && { position: s.position }),
    }),
  )
  if (mergedSeries !== null) {
    relationUpdate.series = mergedSeries
  }

  const mergedTags = applyListOverride(
    overrides.tags,
    current.tags,
    extractedRelations.tags,
    (t) => t.name,
    (t) => t,
    (t) => t.name,
  )
  if (mergedTags !== null) {
    relationUpdate.tags = mergedTags
  }

  return { metadataUpdate, relationUpdate }
}

export async function getMetadataFromEpub(epub: EpubMetadataReader): Promise<{
  update: BookUpdate | null
  relations: BookRelationsUpdate
}> {
  let update: BookUpdate | null = null

  const title = await epub.getTitle()
  if (title) {
    update ??= {}
    update.title = title
  }

  const subtitle = await epub.getSubtitle()
  if (subtitle) {
    update ??= {}
    update.subtitle = subtitle
  }

  const publicationDate = await epub.getPublicationDate()
  if (publicationDate) {
    update ??= {}
    try {
      update.publicationDate = publicationDate.toISOString()
    } catch (e) {
      logger.info(
        `Failed to parse publication date from EPUB: ${publicationDate.toString()}`,
      )
      logger.info(e)
    }
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

  const epubCreators = await epub.getCreators()
  const creators = epubCreators.map<CreatorRelation>((author) => ({
    name: author.name,
    role: author.role && isRole(author.role) ? author.role : "aut",
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

  epub.discardAndClose()

  return {
    update,
    relations: {
      ...(!!tags.length && { tags }),
      ...(!!series.length && { series }),
      ...(!!creators.length && { creators }),
    },
  }
}

export async function getMetadataFromAudiobook(audiobook: Audiobook) {
  let update: BookUpdate | null = null

  const title = await audiobook.getTitle()
  if (title) {
    update ??= {}
    update.title = title
  }

  const subtitle = await audiobook.getSubtitle()
  if (subtitle) {
    update ??= {}
    update.subtitle = subtitle
  }

  const description = await audiobook.getDescription()
  if (description) {
    update ??= {}
    update.description = description
  }

  const authorNames = await audiobook.getAuthors()
  const authors: CreatorRelation[] = authorNames.map((name) => ({
    name,
    role: "aut",
    fileAs: name,
  }))
  const narratorNames = await audiobook.getNarrators()
  const narrators: CreatorRelation[] = narratorNames.map((name) => ({
    name,
    role: "nrt",
    fileAs: name,
  }))

  return {
    update,
    relations: {
      ...((authors.length || narrators.length) && {
        creators: [...authors, ...narrators],
      }),
    },
  }
}

export async function getAudioCoverItem(epub: EpubMetadataReader) {
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

interface WriteMetadataToEpubOptions {
  includeAlignmentMetadata?: boolean
  textCover?: File | undefined
  audioCover?: File | undefined
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
  const titles = await epub.getTitles()

  let titleSet = false
  let subtitleSet = false

  for (const title of titles) {
    if (title.type === "main") {
      title.title = book.title
      titleSet = true
    }
    if (title.type === "subtitle" && book.subtitle) {
      title.title = book.subtitle
      subtitleSet = true
    }
  }

  if (!titleSet) {
    await epub.setTitles([
      { title: book.title, type: "main" },
      ...(book.subtitle ? [{ title: book.subtitle, type: "subtitle" }] : []),
    ])
  } else {
    if (!subtitleSet && book.subtitle) {
      titles.push({ title: book.subtitle, type: "subtitle" })
    }
    await epub.setTitles(titles)
  }

  if (book.publicationDate) {
    await epub.setPublicationDate(new Date(book.publicationDate))
  }

  if (book.description) {
    await epub.setDescription(book.description)
  }

  if (book.language) {
    await epub.setLanguage(new Intl.Locale(book.language))
  }

  for (const _ of await epub.getSubjects()) {
    await epub.removeSubject(0)
  }

  for (const tag of book.tags) {
    await epub.addSubject(tag.name)
  }

  for (const _ of await epub.getCollections()) {
    await epub.removeCollection(0)
  }

  // There was a bug in previous versions of @storyteller-platform/epub
  // where removing collections did not properly remove their corresponding
  // group-position properties, so we clear them all out to remove
  // any junk
  await epub.removeMetadata(
    (item) => item.properties["property"] === "group-position",
  )

  for (const series of book.series) {
    await epub.addCollection({
      name: series.name,
      ...(series.position !== null && { position: series.position.toString() }),
      type: "series",
    })
  }

  for (const _ of await epub.getCreators()) {
    await epub.removeCreator(0)
  }

  // There was a bug in previous versions of @storyteller-platform/epub
  // where removing creators did not properly remove their corresponding
  // role or file-as properties, so we clear them all out to remove
  // any junk
  await epub.removeMetadata(
    (item) =>
      (item.properties["property"] === "role" &&
        item.properties["scheme"] === "marc:relators") ||
      item.properties["property"] === "file-as",
  )

  for (const author of book.authors) {
    await epub.addCreator({
      name: author.name,
      role: "aut",
      roleScheme: "marc:relators",
      fileAs: author.fileAs,
    })
  }

  for (const narrator of book.narrators) {
    await epub.addCreator({
      name: narrator.name,
      role: "nrt",
      roleScheme: "marc:relators",
      fileAs: narrator.fileAs,
    })
  }

  for (const creator of book.creators) {
    await epub.addCreator({
      name: creator.name,
      ...(creator.role && { role: creator.role, scheme: "marc:relator" }),
      fileAs: creator.fileAs,
    })
  }

  // There was a bug in previous versions of Storyteller where we
  // unintentionally stored narrators in a custom metadata property,
  // instead of as creators with nrt roles
  await epub.removeMetadata(
    (item) => item.properties["property"] === "storyteller:narrator",
  )

  // There was a bug in previous versions of @storyteller-platform/epub
  // where collections were incorrectly stored in `<belongs-to-collection>`
  // elements, instead of `<meta>` elements
  await epub.removeMetadata((item) => item.type === "belongs-to-collection")

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

  await epub.setPackageVocabularyPrefix(
    "storyteller",
    "https://storyteller-platform.gitlab.io/storyteller/docs/vocabulary",
  )
}

function compareArray(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false
    }
  }

  return true
}

async function compareAudiobookToMetadata(
  audiobook: Audiobook,
  book: BookWithRelations,
  coverPath: string | null,
) {
  if (coverPath) {
    const newCoverArt = await getAttachedImageFromPath(coverPath)
    const coverArt = await audiobook.getCoverArt()
    if (!coverArt || !compareArray(newCoverArt.data, coverArt.data)) {
      return false
    }
  }
  const authors = await audiobook.getAuthors()
  if (
    authors.length !== book.authors.length ||
    !book.authors.every((author) => authors.includes(author.name))
  ) {
    return false
  }
  const narrators = await audiobook.getNarrators()
  if (
    narrators.length !== book.narrators.length ||
    !book.narrators.every((narrator) => narrators.includes(narrator.name))
  ) {
    return false
  }
  const title = await audiobook.getTitle()
  if (title !== book.title) {
    return false
  }
  const subtitle = await audiobook.getSubtitle()
  if (subtitle !== book.subtitle) {
    return false
  }
  const description = await audiobook.getDescription()
  if (description !== book.description) {
    return false
  }
  return true
}

export async function writeMetadataToAudiobook(
  book: BookWithRelations,
  cover?: File,
) {
  if (!book.audiobook) return
  const directory = book.audiobook.filepath
  const entries = await readdir(directory, { recursive: true })

  const tracks = entries
    .filter((entry) => isAudioFile(entry))
    .map((track) => join(directory, track))
  let coverPath: null | string = null
  if (cover) {
    const ext = extname(cover.name) || extension(cover.type) || ".jpeg"
    const filename = `Audio Cover${ext}`
    const data = new Uint8Array(await cover.arrayBuffer())

    await persistCover(book, "audiobook", {
      filename,
      mimeType: cover.type || "image/jpeg",
      data,
    })

    coverPath = join(getAudiobookCoverDirectory(book), filename)
  }

  try {
    using audiobook = await Audiobook.from(...(tracks as AudiobookInputs))
    if (!(await compareAudiobookToMetadata(audiobook, book, coverPath))) {
      if (coverPath) {
        await audiobook.setCoverArt(await getAttachedImageFromPath(coverPath))
      }
      await audiobook.setAuthors(book.authors.map((author) => author.name))
      await audiobook.setNarrators(
        book.narrators.map((narrator) => narrator.name),
      )
      await audiobook.setTitle(book.title)
      if (book.subtitle) {
        await audiobook.setSubtitle(book.subtitle)
      }
      if (book.description) {
        await audiobook.setDescription(book.description)
      }
      await audiobook.saveAndClose()
    }
  } catch (e) {
    logger.error(
      `Failed to write metadata to audiobook ${book.title} ${book.assetDir}, skipping`,
    )
    logger.error(e)
  }

  try {
    const processedTracks = (await getProcessedAudioFiles(book)).map((track) =>
      join(getProcessedAudioFilepath(book), track),
    )
    using processedAudiobook = await Audiobook.from(
      ...(processedTracks as AudiobookInputs),
    )
    if (
      !(await compareAudiobookToMetadata(processedAudiobook, book, coverPath))
    ) {
      if (coverPath) {
        await processedAudiobook.setCoverArt(
          await getAttachedImageFromPath(coverPath),
        )
      }
      await processedAudiobook.setAuthors(
        book.authors.map((author) => author.name),
      )
      await processedAudiobook.setNarrators(
        book.narrators.map((narrator) => narrator.name),
      )
      await processedAudiobook.setTitle(book.title)
      if (book.subtitle) {
        await processedAudiobook.setSubtitle(book.subtitle)
      }
      if (book.description) {
        await processedAudiobook.setDescription(book.description)
      }
      await processedAudiobook.saveAndClose()
    }
  } catch {
    // We might not have any processed audio files yet, which is fine
  }
}
