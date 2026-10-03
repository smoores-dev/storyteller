import { mkdir, open, readdir, rm, writeFile } from "node:fs/promises"
import { basename, dirname, extname, join } from "node:path"

import {
  Audiobook,
  type AudiobookInputs,
} from "@storyteller-platform/audiobook"
import {
  Epub,
  type EpubReader,
  MemoryAdapter,
} from "@storyteller-platform/epub"
import { scratchPath } from "@storyteller-platform/fs"
import { MediaType } from "@storyteller-platform/media-types"

import { isAudioFile } from "@/audio"
import { type Book, touchBook } from "@/database/books"

import { getAudioCoverItem } from "./metadata"
import { getAudiobookCoverDirectory, getEbookCoverDirectory } from "./paths"

export type CoverData = {
  filename: string
  mimeType: string
  data: Uint8Array
}

function isCoverImage(nameOrPath: string): boolean {
  return MediaType.fromPath(nameOrPath)?.cover === true
}

export type CoverKind = "ebook" | "audiobook"

/**
 * either a path to open lazily, or an already-open reader owned by the caller.
 * reader inputs are not disposed by these helpers.
 */
export type EpubCoverSource = string | EpubReader
export type AudiobookCoverSource = string | Audiobook

async function readCoverFromEpub(epub: EpubReader): Promise<CoverData | null> {
  const coverImageItem = await epub.getCoverImageItem()
  if (!coverImageItem) return null

  const data = await epub.getCoverImage()
  if (!data) return null

  let filename = basename(coverImageItem.href)
  try {
    filename = decodeURIComponent(filename)
  } catch {}

  return {
    filename,
    mimeType:
      coverImageItem.mediaType ??
      MediaType.fromPath(coverImageItem.href)?.mime ??
      MediaType.JPEG.mime,
    data: new Uint8Array(data),
  }
}

export async function extractCoverFromEpub(
  source: EpubCoverSource,
): Promise<CoverData | null> {
  if (typeof source !== "string") return readCoverFromEpub(source)
  using epub = await Epub.using(MemoryAdapter).from(source)
  return await readCoverFromEpub(epub)
}

async function readAudioCoverFromReadaloud(
  epub: EpubReader,
): Promise<CoverData | null> {
  const coverImageItem = await getAudioCoverItem(epub)
  if (!coverImageItem) return null

  const data = await epub.readItemContents(coverImageItem.id)
  let filename = basename(coverImageItem.href)
  try {
    filename = decodeURIComponent(filename)
  } catch {}

  return {
    filename,
    mimeType: coverImageItem.mediaType ?? MediaType.JPEG.mime,
    data: new Uint8Array(data),
  }
}

/**
 * extract the `storyteller:audio-cover-image` manifest item from a
 * readaloud epub, if present.
 */
export async function extractAudioCoverFromReadaloud(
  source: EpubCoverSource,
): Promise<CoverData | null> {
  if (typeof source !== "string") return readAudioCoverFromReadaloud(source)
  using epub = await Epub.using(MemoryAdapter).from(source)
  return await readAudioCoverFromReadaloud(epub)
}

async function readAudioCoverFromReadaloudAudio(
  epub: EpubReader,
): Promise<CoverData | null> {
  const manifest = await epub.getManifest()
  const firstAudioItem = Object.values(manifest).find((item) =>
    item.mediaType?.startsWith("audio/"),
  )
  if (!firstAudioItem) return null

  const audio = await epub.readItemContents(firstAudioItem.id)
  const tmpAudioPath = scratchPath("storyteller", firstAudioItem.href)

  try {
    await mkdir(dirname(tmpAudioPath), { recursive: true })
    await writeFile(tmpAudioPath, audio)

    using audiobook = await Audiobook.from(tmpAudioPath)
    const coverArt = await audiobook.getCoverArt()
    if (!coverArt) return null

    return {
      filename:
        coverArt.name ||
        `Cover${MediaType.fromMime(coverArt.mimeType)?.extension ?? ".jpg"}`,
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
 * extract cover art from the first audio track embedded inside a readaloud
 * epub. this is a last-resort fallback that writes the track to a tmpfile.
 */
export async function extractAudioCoverFromReadaloudAudio(
  source: EpubCoverSource,
): Promise<CoverData | null> {
  if (typeof source !== "string") {
    return readAudioCoverFromReadaloudAudio(source)
  }
  // dont use in mem here, that can get out of hand
  using epub = await Epub.from(source)
  return await readAudioCoverFromReadaloudAudio(epub)
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

    if (name.toLowerCase() === "cover" && isCoverImage(entry)) {
      cover = join(audioDir, entry)
    }

    if (name.toLowerCase() === "audio cover" && isCoverImage(entry)) {
      audioCover = join(audioDir, entry)
    }

    if (ext === ".epub") {
      hasEpub = true
    }
  }

  // when an epub sits alongside audio, only honour an explicit "audio cover"
  const filepath = hasEpub ? audioCover : (audioCover ?? cover)
  if (!filepath) return null

  const file = await open(filepath)
  const data = await file.readFile()
  await file.close()

  return {
    filename: basename(filepath),
    mimeType: MediaType.fromPath(filepath)?.mime ?? MediaType.JPEG.mime,
    data: new Uint8Array(data),
  }
}

async function readCoverFromAudiobook(
  audiobook: Audiobook,
): Promise<CoverData | null> {
  const coverArt = await audiobook.getCoverArt()
  if (!coverArt) return null
  return {
    filename: `Cover${MediaType.fromMime(coverArt.mimeType)?.extension ?? ".jpg"}`,
    mimeType: coverArt.mimeType,
    data: new Uint8Array(coverArt.data),
  }
}

/**
 * extract embedded cover art from audiobook track metadata. tries each audio
 * file in the directory until one yields a cover.
 */
export async function extractCoverFromAudioFiles(
  source: AudiobookCoverSource,
): Promise<CoverData | null> {
  if (typeof source !== "string") return readCoverFromAudiobook(source)

  const entries = await readdir(source)
  const audioFiles = entries.filter((entry) => isAudioFile(entry))

  using audiobook = await Audiobook.from(
    ...(audioFiles.map((file) => join(source, file)) as AudiobookInputs),
  )
  return await readCoverFromAudiobook(audiobook)
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
    const coverEntry = entries.find((entry) => isCoverImage(entry))
    if (!coverEntry) return null

    const file = await open(join(coverDir, coverEntry))
    const stats = await file.stat()
    const data = await file.readFile()
    await file.close()

    return {
      filename: basename(coverEntry),
      mimeType: MediaType.fromPath(coverEntry)?.mime ?? MediaType.JPEG.mime,
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
  await touchBook(book.uuid)
}

/**
 * extract and persist an ebook cover. tries the readaloud epub first (it
 * usually has the same cover as the ebook), then falls back to the plain epub.
 */
export async function extractAndPersistTextCover(
  book: Book,
  ebook: EpubCoverSource | null,
  readaloud?: EpubCoverSource | null,
): Promise<CoverData | null> {
  const primary = readaloud ?? ebook
  if (!primary) return null

  const cover = await extractCoverFromEpub(primary)

  // if the readaloud failed, try the plain epub
  if (!cover && readaloud && ebook && readaloud !== ebook) {
    const fallback = await extractCoverFromEpub(ebook)
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
  audiobook: AudiobookCoverSource | null,
  readaloud?: EpubCoverSource | null,
  audiobookDir?: string | null,
): Promise<CoverData | null> {
  const strategies: (() => Promise<CoverData | null>)[] = []

  if (readaloud) {
    strategies.push(() => extractAudioCoverFromReadaloud(readaloud))
    strategies.push(() => extractAudioCoverFromReadaloudAudio(readaloud))
  }

  // dir-based fallback needs a real directory path; an open Audiobook doesn't
  // carry one, so callers can pass it explicitly.
  const dirForLooseCover =
    audiobookDir ?? (typeof audiobook === "string" ? audiobook : null)
  if (dirForLooseCover) {
    strategies.push(() => extractCoverFileFromAudioDir(dirForLooseCover))
  }
  if (audiobook) {
    strategies.push(() => extractCoverFromAudioFiles(audiobook))
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
