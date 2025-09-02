import { basename, dirname, extname, join } from "node:path"

import { type Book, type BookWithRelations } from "@/database/books"
import { type Settings } from "@/database/settingsTypes"
import { ASSETS_DIR, IMAGE_CACHE_DIR } from "@/directories"
import { type UUID } from "@/uuid"

const base62Chars =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

function base62Encode(bytes: Uint8Array): string {
  let num = BigInt(0)
  for (const byte of bytes) {
    num = (num << 8n) | BigInt(byte)
  }

  let result = ""
  while (num > 0n) {
    // @ts-expect-error Typescript thinks that you can't use a bigint as an index
    // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
    result = base62Chars[num % 62n] + result
    num /= 62n
  }

  return result.padStart(8, "0") // Ensure fixed length if desired
}

export function shortenUuid(uuid: UUID, numBytes = 6): string {
  const hex = uuid.replace(/-/g, "")
  const bytes = new Uint8Array(numBytes)
  for (let i = 0; i < numBytes; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return base62Encode(bytes)
}

export function getDefaultSuffix(uuid: UUID) {
  return ` [${shortenUuid(uuid)}]`
}

function sanitizeFilename(title: string): string {
  return title
    .replace(/[/\\:*?"<>|]/g, "-") // Windows illegal chars
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim() // Trim trailing whitespace
    .replace(/[.]+$/, "") // No trailing dots
}

function truncate(input: string, byteLimit: number, suffix = ""): string {
  const normalized = input.normalize("NFC")
  const encoder = new TextEncoder()

  let result = ""
  for (const char of normalized) {
    const withSuffix = result + char + suffix
    const byteLength = encoder.encode(withSuffix).length

    if (byteLength > byteLimit) break
    result += char
  }

  return result + suffix
}

export function getSafeFilepathSegment(name: string, suffix: string = "") {
  return truncate(sanitizeFilename(name), 150, suffix)
}

export function getInternalBookDirectory(book: Book) {
  const filename = getSafeFilepathSegment(book.title, book.suffix)
  return join(ASSETS_DIR, filename)
}

export function getInternalEpubDirectory(book: Book) {
  return join(getInternalBookDirectory(book), "text")
}

export function getInternalReadaloudDirectory(book: Book) {
  return join(getInternalBookDirectory(book), "aligned")
}

export function getInternalReadaloudFilepath(book: Book) {
  return join(
    getInternalReadaloudDirectory(book),
    getSafeFilepathSegment(book.title, ".epub"),
  )
}

export function getReadaloudFilepath(
  book: BookWithRelations,
  settings: Settings,
) {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const ebookFilepath = book.ebook!.filepath
  if (ebookFilepath === getInternalEpubFilepath(book)) {
    return getInternalReadaloudFilepath(book)
  }

  const ebookFolder = dirname(ebookFilepath)
  switch (settings.readaloudLocationType) {
    case "SUFFIX": {
      return join(
        ebookFolder,
        getSafeFilepathSegment(
          book.title,
          `${settings.readaloudLocation}.epub`,
        ),
      )
    }
    case "SIBLING_FOLDER": {
      return join(
        ebookFolder,
        settings.readaloudLocation,
        getSafeFilepathSegment(book.title, ".epub"),
      )
    }
    case "CUSTOM_FOLDER": {
      return join(
        settings.readaloudLocation,
        getSafeFilepathSegment(book.title, ".epub"),
      )
    }
    case "INTERNAL": {
      return getInternalReadaloudFilepath(book)
    }
  }
}

export function getInternalEpubFilepath(book: Book) {
  return join(
    getInternalEpubDirectory(book),
    getSafeFilepathSegment(book.title, ".epub"),
  )
}

export function getInternalAudioDirectory(book: Book) {
  return join(getInternalBookDirectory(book), "audio")
}

export function getInternalOriginalAudioFilepath(book: Book, filename = "") {
  return join(getInternalAudioDirectory(book), filename)
}

export function getProcessedAudioFilepath(book: Book, filename = "") {
  return join(getInternalBookDirectory(book), "transcoded audio", filename)
}

export function getTranscriptionsFilepath(book: Book, filename = "") {
  return join(getInternalBookDirectory(book), "transcriptions", filename)
}

export function getAlignmentReportFilepath(book: Book) {
  return join(getInternalBookDirectory(book), ".storyteller", "report.json")
}

export function getTranscriptionFilename(audioFilepath: string) {
  const ext = extname(audioFilepath)
  const bare = basename(audioFilepath, ext)
  return `${bare}.json`
}

export function getCoverImageCacheDirectory(uuid: UUID) {
  return join(IMAGE_CACHE_DIR, uuid)
}

export function getCachedCoverImageDirectory(
  uuid: UUID,
  kind: "audio" | "text",
  height: number,
  width: number,
) {
  return join(getCoverImageCacheDirectory(uuid), kind, `${height}x${width}`)
}

export function getAudiobookCoverDirectory(book: Book) {
  return join(getInternalBookDirectory(book), "audiobook cover")
}

export function getEbookCoverDirectory(book: Book) {
  return join(getInternalBookDirectory(book), "ebook cover")
}
