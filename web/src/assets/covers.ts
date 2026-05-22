import { mkdir, open, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, extname, join } from "node:path"

import { extension, lookup } from "mime-types"

import { Audiobook } from "@storyteller-platform/audiobook"
import { Epub } from "@storyteller-platform/epub"

import { COVER_IMAGE_FILE_EXTENSIONS, isAudioFile } from "@/audio"
import {
  type Book,
  type BookWithRelations,
  getBookOrThrow,
  touchBook,
} from "@/database/books"
import { type UUID } from "@/uuid"

import { getAudioCoverItem } from "./metadata"
import { getAudiobookCoverDirectory, getEbookCoverDirectory } from "./paths"

export type AudioFile = {
  filename: string
  bare_filename: string
  extension: string
}

export type AudioIndex = {
  cover?: string
  processed_files?: AudioFile[]
}

export async function getFirstCoverImage(directory: string) {
  // non-recursive, we won't traverse nested layouts
  const entries = await readdir(directory)

  const firstTrack = entries.find((entry) => isAudioFile(entry))
  if (!firstTrack) return null

  try {
    using audiobook = await Audiobook.from(join(directory, firstTrack))
    const coverImage = await audiobook.getCoverArt()
    audiobook.discardAndClose()
    if (!coverImage) return null

    return {
      data: coverImage.data,
      format: coverImage.mimeType,
      audiofile: join(directory, firstTrack),
    }
  } catch {
    return null
  }
}

async function findValidAudioCoverFile(directory: string) {
  // top-level only: cover.jpg / audio cover.jpg sit alongside tracks.
  const entries = await readdir(directory)

  let cover: null | string = null
  let audioCover: null | string = null
  let epub: null | string = null

  for (const entry of entries) {
    const ext = extname(entry)
    const name = basename(entry, ext)
    if (
      name.toLowerCase() === "cover" &&
      COVER_IMAGE_FILE_EXTENSIONS.includes(ext)
    ) {
      cover = join(directory, entry)
    }
    if (
      name.toLowerCase() === "audio cover" &&
      COVER_IMAGE_FILE_EXTENSIONS.includes(ext)
    ) {
      audioCover = join(directory, entry)
    }
    if (ext === ".epub") {
      epub = entry
    }
  }

  if (epub) return audioCover
  return audioCover ?? cover
}

export async function getAudioCoverFilepath(book: BookWithRelations) {
  const audioDirectory = book.audiobook?.filepath
  if (!audioDirectory || book.audiobook?.missing) return null

  const coverFile = await findValidAudioCoverFile(audioDirectory)

  return coverFile
}

export async function persistCustomAudioCover(
  bookUuid: UUID,
  filename: string,
  cover: Uint8Array,
) {
  const book = await getBookOrThrow(bookUuid)
  const audioDirectory = book.audiobook?.filepath
  if (!audioDirectory) return

  const coverFile = await findValidAudioCoverFile(audioDirectory)
  if (coverFile) {
    await rm(join(audioDirectory, coverFile))
  }

  await writeFile(join(audioDirectory, filename), cover)
}

export async function getCustomAudioCover(book: BookWithRelations) {
  const filepath = await getAudioCoverFilepath(book)
  if (filepath === null) return null

  const buffer = await readFile(filepath)
  return new Uint8Array(buffer)
}

export async function getAudioCoverFromCustomFile(book: BookWithRelations) {
  if (!book.audiobook || book.audiobook.missing) return null
  const customCoverFilepath = await getAudioCoverFilepath(book)

  if (!customCoverFilepath) return null
  const file = await open(customCoverFilepath)
  const stats = await file.stat()
  const data = await file.readFile()
  await file.close()
  return {
    filename: basename(customCoverFilepath),
    mimeType: lookup(customCoverFilepath) || "image/jpeg",
    stats,
    data,
  }
}

export async function getAudioCoverFromReadaloud(book: BookWithRelations) {
  if (!book.readaloud?.filepath || book.readaloud.missing) return null

  using epub = await Epub.from(book.readaloud.filepath)

  const coverImageItem = await getAudioCoverItem(epub)
  if (!coverImageItem) {
    epub.discardAndClose()
    return null
  }

  const data = await epub.readItemContents(coverImageItem.id)
  epub.discardAndClose()

  const file = await open(book.readaloud.filepath)
  const stats = await file.stat()
  await file.close()
  return {
    filename: basename(coverImageItem.href),
    mimeType: coverImageItem.mediaType ?? "image/jpeg",
    stats: stats,
    data: Buffer.from(data),
  }
}

export async function getAudioCoverFromReadaloudAudio(book: BookWithRelations) {
  if (!book.readaloud?.filepath || book.readaloud.missing) return null

  using epub = await Epub.from(book.readaloud.filepath)

  const manifest = await epub.getManifest()
  // TODO: Would be better to get the first audio file that
  // actually corresponds to a media overlay
  const firstAudioItem = Object.values(manifest).find((item) =>
    item.mediaType?.startsWith("audio/"),
  )
  if (!firstAudioItem) return null

  const audio = await epub.readItemContents(firstAudioItem.id)

  const tmpAudioPath = join(tmpdir(), "storyteller", firstAudioItem.href)

  try {
    await mkdir(dirname(tmpAudioPath), { recursive: true })
    await writeFile(tmpAudioPath, audio)
    using audiobook = await Audiobook.from(tmpAudioPath)
    const coverArt = await audiobook.getCoverArt()
    audiobook.discardAndClose()
    if (!coverArt) return null

    const file = await open(book.readaloud.filepath)
    const stats = await file.stat()
    await file.close()
    return {
      filename: coverArt.name || `Cover.${extension(coverArt.mimeType)}`,
      mimeType: coverArt.mimeType,
      stats,
      data: Buffer.from(coverArt.data),
    }
  } finally {
    try {
      await rm(tmpAudioPath)
    } catch {
      //
    }
  }
}

export async function getAudioCoverFromAudiobook(book: BookWithRelations) {
  console.log("getAudioCoverFromAudiobook", book.audiobook)
  if (!book.audiobook || book.audiobook.missing) return null
  const directory = book.audiobook.filepath

  const entries = await readdir(directory)

  let firstCover: {
    audiofile: string
    image: { data: Uint8Array; mimeType: string }
  } | null = null
  for (const entry of entries) {
    console.log("checking entry", entry)
    if (!isAudioFile(entry)) continue
    console.log("is audio file", entry)
    const path = join(directory, entry)
    try {
      using audiobook = await Audiobook.from(path)
      const coverArt = await audiobook.getCoverArt()
      audiobook.discardAndClose()
      if (coverArt) {
        firstCover = { audiofile: path, image: coverArt }
        break
      }
    } catch {
      // try the next track
    }
  }

  if (!firstCover) return null

  const file = await open(firstCover.audiofile)
  const stats = await file.stat()
  await file.close()
  return {
    filename: `Cover.${extension(firstCover.image.mimeType)}`,
    mimeType: firstCover.image.mimeType,
    stats,
    data: Buffer.from(firstCover.image.data),
  }
}

export async function getAudioCover(book: BookWithRelations) {
  const strategies = [
    getAudioCoverFromReadaloud,
    getAudioCoverFromReadaloudAudio,
    getAudioCoverFromCustomFile,
    getAudioCoverFromAudiobook,
  ]
  for (const strategy of strategies) {
    const cover = await strategy(book)
    if (cover) return cover
  }
  return null
}

export async function getEpubCover(book: BookWithRelations) {
  const epubFilepath =
    !book.readaloud?.missing && book.readaloud?.filepath
      ? book.readaloud.filepath
      : !book.ebook?.missing && book.ebook
        ? book.ebook.filepath
        : null

  if (!epubFilepath) return null

  using epub = await Epub.from(epubFilepath)

  const coverImageItem = await epub.getCoverImageItem()
  if (!coverImageItem) return null
  const data = await epub.getCoverImage()
  if (!data) return null

  const epubFile = await open(epubFilepath)
  const stats = await epubFile.stat()
  await epubFile.close()

  return {
    filename: basename(coverImageItem.href),
    mimeType:
      coverImageItem.mediaType ?? (lookup(coverImageItem.href) || "image/jpeg"),
    data: Buffer.from(data) as Buffer,
    stats,
  }
}

export type CoverKind = "ebook" | "audiobook"

function getCoverDirectory(book: Book, kind: CoverKind) {
  return kind === "ebook"
    ? getEbookCoverDirectory(book)
    : getAudiobookCoverDirectory(book)
}

export async function getExtractedCover(book: Book, kind: CoverKind) {
  const coverDir = getCoverDirectory(book, kind)
  try {
    const entries = await readdir(coverDir)
    const coverEntry = entries.find((entry) =>
      COVER_IMAGE_FILE_EXTENSIONS.includes(extname(entry)),
    )
    if (!coverEntry) return null

    const file = await open(join(coverDir, coverEntry))
    const stats = await file.stat()
    const data = await file.readFile()
    await file.close()

    const mimeType = lookup(coverEntry) || "image/jpeg"

    return {
      filename: basename(coverEntry),
      mimeType,
      stats,
      data,
    }
  } catch {
    return null
  }
}

export async function writeExtractedCover(
  book: Book,
  kind: CoverKind,
  filename: string,
  data: Uint8Array,
) {
  const coverDir = getCoverDirectory(book, kind)
  console.log("writeExtractedCover", coverDir)
  const existing = await getExtractedCover(book, kind)
  console.log("existing", existing)
  if (existing) {
    console.log("removing existing cover", existing.filename)
    await rm(join(coverDir, existing.filename))
  }
  console.log("writing cover", filename)
  await mkdir(coverDir, { recursive: true })
  console.log("writing file", join(coverDir, filename))
  await writeFile(join(coverDir, filename), data)
  console.log("touching book", book.uuid)
  await touchBook(book.uuid)
}
