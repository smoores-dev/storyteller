import {
  type BookWithRelations,
  getBookByAudiobookFilepathPrefix,
} from "@/database/books"
import { addBooksToCollections } from "@/database/collections"
import { getSetting } from "@/database/settings"
import { type ImportMode } from "@/database/settingsTypes"
import { type UUID } from "@/uuid"

import {
  type BookPath,
  attachNewRelations,
  canonicalizePath,
  createNewBook,
  findMatchingBook,
  getBookPathFormats,
} from "./discovery"
import { type ScanFormat } from "./scanner/types"

export type UnclassifiedEpub = {
  bookUuid: UUID
  filepath: string
}

type ReconcileInput = {
  bookPaths: BookPath[]
  collectionUuids: UUID[]
  allBooks: BookWithRelations[]
  scopedBooks: BookWithRelations[]
  signal: AbortSignal
  importMode?: ImportMode
}

export type ReconcileResult = {
  /** formats that already existed and are being re-scanned (e.g. due to change). */
  formatsByBook: Map<UUID, Set<ScanFormat>>
  /** formats discovered for the first time in this scan (implies isNew=true). */
  newFormatsByBook: Map<UUID, Set<ScanFormat>>
  unclassifiedEpubs: UnclassifiedEpub[]
}

function addFormats(
  target: Map<UUID, Set<ScanFormat>>,
  bookUuid: UUID,
  formats: ScanFormat[],
) {
  if (!formats.length) return
  const existing = target.get(bookUuid) ?? new Set<ScanFormat>()
  for (const format of formats) existing.add(format)
  target.set(bookUuid, existing)
}

function collectUnclassifiedEpubs(
  bookUuid: UUID,
  bookPath: BookPath,
  output: UnclassifiedEpub[],
) {
  if (!bookPath.epubUnknown?.length) return

  for (const filepath of bookPath.epubUnknown) {
    output.push({ bookUuid, filepath })
  }
}

function hasAnyRelationChange(
  book: BookWithRelations,
  bookPath: BookPath,
): boolean {
  const ebookChanged = !!bookPath.ebook && !book.ebook
  const audiobookChanged = !!bookPath.audiobook && !book.audiobook
  const readaloudChanged = !!bookPath.readaloud && !book.readaloud
  const hasUnclassifiedEpubs = !!bookPath.epubUnknown?.length

  return (
    ebookChanged || audiobookChanged || readaloudChanged || hasUnclassifiedEpubs
  )
}

async function findMatchingBookByRealpath(
  books: BookWithRelations[],
  bookPath: BookPath,
): Promise<BookWithRelations | undefined> {
  const candidatePaths = [
    bookPath.ebook,
    bookPath.audiobook,
    bookPath.readaloud,
  ].filter((p): p is string => !!p)

  if (candidatePaths.length === 0) return undefined

  const canonicalCandidates = await Promise.all(
    candidatePaths.map((p) => canonicalizePath(p)),
  )

  for (const book of books) {
    const storedPaths = [
      book.ebook?.filepath,
      book.audiobook?.filepath,
      book.readaloud?.filepath,
    ].filter((p): p is string => !!p)

    for (const stored of storedPaths) {
      const canonicalStored = await canonicalizePath(stored)

      if (canonicalCandidates.includes(canonicalStored)) {
        return book
      }
    }
  }

  return undefined
}

/**
 * Given a list of discovered book-path groupings, create new books,
 * attach new format relations to existing books, and return the
 * per-book format sets that a subsequent scan should target.
 */
export async function reconcileDiscoveredPaths(
  input: ReconcileInput,
): Promise<ReconcileResult> {
  const importMode = input.importMode ?? (await getSetting("importMode"))
  const result: ReconcileResult = {
    formatsByBook: new Map(),
    newFormatsByBook: new Map(),
    unclassifiedEpubs: [],
  }

  let currentAll = input.allBooks
  let currentScoped = input.scopedBooks

  for (const bookPath of input.bookPaths) {
    if (input.signal.aborted) return result

    const fastMatch = findMatchingBook(currentAll, bookPath)
    const globalMatch =
      fastMatch ?? (await findMatchingBookByRealpath(currentAll, bookPath))

    const scopedMatch =
      globalMatch &&
      currentScoped.some((book) => book.uuid === globalMatch.uuid)
        ? globalMatch
        : null

    // book exists globally but not in the scoped set: add it
    // to any missing collections so overlapping paths share the same book
    if (globalMatch && !scopedMatch) {
      const missingCollections = input.collectionUuids.filter(
        (uuid) => !globalMatch.collections.some((c) => c.uuid === uuid),
      )

      if (missingCollections.length > 0) {
        await addBooksToCollections(missingCollections, [globalMatch.uuid])
      }

      continue
    }

    if (!scopedMatch) {
      if (bookPath.audiobook) {
        const nestedBook = await getBookByAudiobookFilepathPrefix(
          bookPath.audiobook,
        )
        if (nestedBook) continue
      }

      const firstCollection = input.collectionUuids[0] ?? null

      const created = await createNewBook(bookPath, firstCollection, importMode)
      if (!created) continue

      const remainingCollections = input.collectionUuids.slice(1)
      if (remainingCollections.length > 0) {
        await addBooksToCollections(remainingCollections, [created.uuid])
      }

      const discoveredFormats = getBookPathFormats(bookPath)
      addFormats(result.formatsByBook, created.uuid, discoveredFormats)
      addFormats(result.newFormatsByBook, created.uuid, discoveredFormats)
      collectUnclassifiedEpubs(created.uuid, bookPath, result.unclassifiedEpubs)

      currentScoped.push(created)
      currentAll.push(created)
      continue
    }

    if (!hasAnyRelationChange(scopedMatch, bookPath)) continue

    const updated = await attachNewRelations(scopedMatch, bookPath, importMode)
    addFormats(result.formatsByBook, updated.book.uuid, updated.newFormats)
    addFormats(result.newFormatsByBook, updated.book.uuid, updated.newFormats)
    collectUnclassifiedEpubs(
      scopedMatch.uuid,
      bookPath,
      result.unclassifiedEpubs,
    )

    currentScoped = currentScoped.map((book) =>
      book.uuid === updated.book.uuid ? updated.book : book,
    )
    currentAll = currentAll.map((book) =>
      book.uuid === updated.book.uuid ? updated.book : book,
    )
  }

  return result
}
