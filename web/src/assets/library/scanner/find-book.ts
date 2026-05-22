import {
  canonicalizePath,
  pathBelongsTo,
} from "@/assets/library/scanner/folder"
import { type Candidate } from "@/assets/library/scanner/types"
import {
  type BookWithRelations,
  getBook,
  getBookByAudiobookFilepathPrefix,
  getBooks,
} from "@/database/books"
import { ASSETS_DIR } from "@/directories"
import { logger } from "@/logging"

/**
 * find an existing book that should own the candidate's file, in this order
 *   1. candidate.existingBook (already known, eg from a manual/scheduled full library scan).
 *   2. candidate.bookUuidHint (upload route knows the target UUID).
 *   3. check ebook.filepath, audiobook.filepath, readaloud.filepath against the candidate.filepath
 *   4. same as 3, but canonicalize the paths first (bind mounts)
 *   5. check audiobook.filepath prefix against the candidate.filepath
 */
export async function findExistingBook(
  candidate: Candidate,
  books?: BookWithRelations[],
): Promise<BookWithRelations | null> {
  if (candidate.existingBook) return candidate.existingBook

  if (candidate.bookUuidHint) {
    const book = await getBook(candidate.bookUuidHint)
    if (book) return book
  }

  const allBooks = books ?? (await getBooks())

  const exact = allBooks.find((book) =>
    bookReferencesPath(book, candidate.format, candidate.filepath),
  )
  if (exact) return exact

  const canonicalCandidate = await canonicalizePath(candidate.filepath)
  for (const book of allBooks) {
    const stored = pathForFormat(book, candidate.format)
    if (!stored) continue
    const canonicalStored = await canonicalizePath(stored)
    if (canonicalStored === canonicalCandidate) return book
  }

  if (candidate.format === "audiobook") {
    const nested = await getBookByAudiobookFilepathPrefix(candidate.filepath)
    if (nested) {
      const full = await getBook(nested.uuid)
      if (full) return full
    }
  }

  return null
}

/**
 * ASSETS_DIR is library-owned: orphan files there are integrity errors, not
 * new books to adopt.
 */
export function isOrphanInAssetsDir(
  candidate: Candidate,
  existingBook: BookWithRelations | null,
): boolean {
  if (existingBook) return false
  if (!pathBelongsTo(ASSETS_DIR, candidate.filepath)) return false
  logger.warn({
    msg: "Skipping orphan file in ASSETS_DIR: no matching book row, not adopting",
    filepath: candidate.filepath,
    format: candidate.format,
  })
  return true
}

function pathForFormat(
  book: BookWithRelations,
  format: Candidate["format"],
): string | null {
  switch (format) {
    case "ebook":
      return book.ebook?.filepath ?? null
    case "audiobook":
      return book.audiobook?.filepath ?? null
    case "readaloud":
      return book.readaloud?.filepath ?? null
  }
}

function bookReferencesPath(
  book: BookWithRelations,
  format: Candidate["format"],
  filepath: string,
): boolean {
  return pathForFormat(book, format) === filepath
}
