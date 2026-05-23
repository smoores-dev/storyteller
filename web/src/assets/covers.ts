import { mkdir, open, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, extname, join } from "node:path"

import { extension, lookup } from "mime-types"

import {
  Audiobook,
  type AudiobookInputs,
} from "@storyteller-platform/audiobook"
import { Epub } from "@storyteller-platform/epub"

import { COVER_IMAGE_FILE_EXTENSIONS, isAudioFile } from "@/audio"
import { type Book, touchBook } from "@/database/books"

import { deleteCachedCoverImagesByKind } from "./fs"
import { getAudioCoverItem } from "./metadata"
import { getAudiobookCoverDirectory, getEbookCoverDirectory } from "./paths"

export type CoverData = {
  filename: string
  mimeType: string
  data: Uint8Array
}

export type CoverKind = "ebook" | "audiobook"

export async function extractCoverFromEpub(
  epubPath: string,
): Promise<CoverData | null> {
  using epub = await Epub.from(epubPath)

  const coverImageItem = await epub.getCoverImageItem()
  if (!coverImageItem) return null

  const data = await epub.getCoverImage()
  if (!data) return null

  return {
    filename: basename(coverImageItem.href),
    mimeType:
      coverImageItem.mediaType ?? (lookup(coverImageItem.href) || "image/jpeg"),
    data: new Uint8Array(data),
  }
}

/**
 * extract the `storyteller:audio-cover-image` manifest item from a
 * readaloud epub, if present.
 */
export async function extractAudioCoverFromReadaloud(
  readaloudPath: string,
): Promise<CoverData | null> {
  using epub = await Epub.from(readaloudPath)

  const coverImageItem = await getAudioCoverItem(epub)
  if (!coverImageItem) {
    epub.discardAndClose()
    return null
  }

  const data = await epub.readItemContents(coverImageItem.id)
  epub.discardAndClose()

  return {
    filename: basename(coverImageItem.href),
    mimeType: coverImageItem.mediaType ?? "image/jpeg",
    data: new Uint8Array(data),
  }
}

/**
 * extract cover art from the first audio track embedded inside a readaloud
 * epub. this is a last-resort fallback that writes the track to a tmpfile.
 */
export async function extractAudioCoverFromReadaloudAudio(
  readaloudPath: string,
): Promise<CoverData | null> {
  using epub = await Epub.from(readaloudPath)

  const manifest = await epub.getManifest()
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

    return {
      filename: coverArt.name || `Cover.${extension(coverArt.mimeType)}`,
      mimeType: coverArt.mimeType,
      data: new Uint8Array(coverArt.data),
    }
  } finally {
    try {
      await rm(tmpAudioPath)
    } catch {
      //
    }
  }
}

/**
 * look for a loose cover image file alongside audio tracks in a directory
 * (e.g. `cover.jpg`, `audio cover.jpg`).
 */
export async function extractCoverFileFromAudioDir(
  audioDir: string,
): Promise<CoverData | null> {
  const entries = await readdir(audioDir)

  let cover: string | null = null
  let audioCover: string | null = null
  let hasEpub = false

  for (const entry of entries) {
    const ext = extname(entry)
    const name = basename(entry, ext)

    if (
      name.toLowerCase() === "cover" &&
      COVER_IMAGE_FILE_EXTENSIONS.includes(ext)
    ) {
      cover = join(audioDir, entry)
    }

    if (
      name.toLowerCase() === "audio cover" &&
      COVER_IMAGE_FILE_EXTENSIONS.includes(ext)
    ) {
      audioCover = join(audioDir, entry)
    }

    if (ext === ".epub") {
      hasEpub = true
    }
  }

  // when an epub sits alongside audio, only honour an explicit "audio cover"
  const filepath = hasEpub ? audioCover : audioCover ?? cover
  if (!filepath) return null

  const file = await open(filepath)
  const data = await file.readFile()
  await file.close()

  return {
    filename: basename(filepath),
    mimeType: lookup(filepath) || "image/jpeg",
    data: new Uint8Array(data),
  }
}

/**
 * extract embedded cover art from audiobook track metadata. tries each audio
 * file in the directory until one yields a cover.
 */
export async function extractCoverFromAudioFiles(
  audioDir: string,
): Promise<CoverData | null> {
  const entries = await readdir(audioDir)

  const audioFiles = entries.filter((entry) => isAudioFile(entry))

  using audiobook = await Audiobook.from(
    ...(audioFiles.map((file) => join(audioDir, file)) as AudiobookInputs),
  )
  const coverArt = await audiobook.getCoverArt()
  audiobook.discardAndClose()
  if (coverArt) {
    return {
      filename: `Cover.${extension(coverArt.mimeType)}`,
      mimeType: coverArt.mimeType,
      data: new Uint8Array(coverArt.data),
    }
  }
  return null
}

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

    return {
      filename: basename(coverEntry),
      mimeType: lookup(coverEntry) || "image/jpeg",
      stats,
      data,
    }
  } catch {
    return null
  }
}

/**
 * write a cover to the cover directory and invalidate the
 * resize cache for that kind.
 */
export async function persistCover(
  book: Book,
  kind: CoverKind,
  cover: CoverData,
) {
  const coverDir = getCoverDirectory(book, kind)

  const existing = await getExtractedCover(book, kind)
  if (existing) {
    await rm(join(coverDir, existing.filename))
  }

  await mkdir(coverDir, { recursive: true })
  await writeFile(join(coverDir, cover.filename), cover.data)
  await deleteCachedCoverImagesByKind(
    book.uuid,
    kind === "ebook" ? "text" : "audio",
  )
  await touchBook(book.uuid)
}

/**
 * extract and persist an ebook cover. tries the readaloud epub first (it
 * usually has the same cover as the ebook), then falls back to the plain epub.
 */
export async function extractAndPersistTextCover(
  book: Book,
  epubPath: string | null,
  readaloudPath?: string | null,
): Promise<CoverData | null> {
  const pathToTry = readaloudPath ?? epubPath
  if (!pathToTry) return null

  const cover = await extractCoverFromEpub(pathToTry)

  // if the readaloud failed, try the plain epub
  if (!cover && readaloudPath && epubPath && readaloudPath !== epubPath) {
    const fallback = await extractCoverFromEpub(epubPath)
    if (fallback) {
      await persistCover(book, "ebook", fallback)
      return fallback
    }
  }

  if (!cover) return null

  await persistCover(book, "ebook", cover)
  return cover
}

/**
 * extract and persist an audiobook cover
 *
 * 1. readaloud epub `storyteller:audio-cover-image` manifest item
 * 2. readaloud epub embedded audio track cover art
 * 3. loose cover file alongside audio tracks (`Audio Cover.jpg` / `cover.jpg`)
 * 4. embedded cover art in audiobook track metadata
 */
export async function extractAndPersistAudioCover(
  book: Book,
  audiobookPath: string | null,
  readaloudPath?: string | null,
): Promise<CoverData | null> {
  const strategies: (() => Promise<CoverData | null>)[] = []

  if (readaloudPath) {
    strategies.push(() => extractAudioCoverFromReadaloud(readaloudPath))
    strategies.push(() => extractAudioCoverFromReadaloudAudio(readaloudPath))
  }

  if (audiobookPath) {
    strategies.push(() => extractCoverFileFromAudioDir(audiobookPath))
    strategies.push(() => extractCoverFromAudioFiles(audiobookPath))
  }

  for (const strategy of strategies) {
    const cover = await strategy()

    if (cover) {
      await persistCover(book, "audiobook", cover)
      return cover
    }
  }

  return null
}
