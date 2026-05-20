
import { canonicalizePath } from "@/assets/library/scanner/folder"
import { type Candidate } from "@/assets/library/scanner/types"
import {
  type BookWithRelations,
  getBook,
  getBookByAudiobookFilepathPrefix,
  getBooks,
} from "@/database/books"

/**
 * Find an existing book that should own the candidate's file.
 *
 * Lookup order (first hit wins):
 *   1. candidate.existingBook (caller already resolved it).
 *   2. candidate.bookUuidHint (upload route knows the target UUID).
 *   3. Exact filepath match against any format-relation of any book.
 *   4. canonical-path match (handles symlinks / bind mounts).
 *   5. For audiobooks: filepath-prefix match against the audiobook table.
 *
 * No DB writes. Returns null when nothing matches; the caller decides
 * whether to create a new book.
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
