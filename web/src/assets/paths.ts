import { Book } from "@/database/books"
import { ASSETS_DIR } from "@/directories"
import { UUID } from "@/uuid"
import { join } from "node:path"

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
    .replace(/\s+/g, " ") // normalize whitespace
    .trim()
    .replace(/[. ]+$/, "") // no trailing dot or space
}

function truncate(input: string, byteLimit: number, suffix = ""): string {
  const normalized = input.normalize("NFC") // ensure consistent encoding
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

export function getInternalEpubAlignedDirectory(book: Book) {
  return join(getInternalBookDirectory(book), "aligned")
}

export function getInternalEpubAlignedFilepath(book: Book) {
  return join(
    getInternalEpubAlignedDirectory(book),
    getSafeFilepathSegment(book.title, ".epub"),
  )
}

export function getInternalEpubFilepath(book: Book) {
  return join(
    getInternalEpubDirectory(book),
    getSafeFilepathSegment(book.title, ".epub"),
  )
}

export function getInternalEpubIndexPath(book: Book) {
  return join(getInternalEpubDirectory(book), ".storyteller-index.json")
}

export function getInternalAudioDirectory(book: Book) {
  return join(getInternalBookDirectory(book), "audio")
}

export function getInternalAudioIndexPath(book: Book) {
  return join(getInternalAudioDirectory(book), ".storyteller-index.json")
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
