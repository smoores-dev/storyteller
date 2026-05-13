import {
  type BookWithRelations,
  getBookByAudiobookFilepathPrefix,
} from "@/database/books"
import { addBooksToCollections } from "@/database/collections"
import { addImportSkipPaths } from "@/database/scans"
import { getSetting } from "@/database/settings"
import { type UUID } from "@/uuid"

import {
  type BookPath,
  attachNewRelations,
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
  collectionUuid: UUID | null
  allBooks: BookWithRelations[]
  scopedBooks: BookWithRelations[]
  signal: AbortSignal
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
  newSkipPaths: { bookUuid: UUID; filepath: string }[],
) {
  if (!bookPath.epubUnknown?.length) return
  for (const filepath of bookPath.epubUnknown) {
    output.push({ bookUuid, filepath })
    // unclassified epubs aren't relocated — their filepath stays as-is
    // and the scanner pipeline writes the relation later. record the
    // skip path now so the next scan won't rediscover the file.
    newSkipPaths.push({ bookUuid, filepath })
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

/**
 * Given a list of discovered book-path groupings, create new books,
 * attach new format relations to existing books, and return the
 * per-book format sets that a subsequent scan should target.
 */
export async function reconcileDiscoveredPaths(
  input: ReconcileInput,
): Promise<ReconcileResult> {
  const importMode = await getSetting("importMode")
  const result: ReconcileResult = {
    formatsByBook: new Map(),
    newFormatsByBook: new Map(),
    unclassifiedEpubs: [],
  }

  let currentAll = input.allBooks
  let currentScoped = input.scopedBooks

  const newSkipPaths: { bookUuid: UUID; filepath: string }[] = []
  for (const bookPath of input.bookPaths) {
    if (input.signal.aborted) return result

    const globalMatch = findMatchingBook(currentAll, bookPath)
    const scopedMatch =
      globalMatch &&
      currentScoped.some((book) => book.uuid === globalMatch.uuid)
        ? globalMatch
        : null

    // book exists globally but not in the current collection add it
    // to this collection so overlapping import paths share the same book
    if (globalMatch && !scopedMatch) {
      if (input.collectionUuid) {
        const alreadyInCollection = globalMatch.collections.some(
          (c) => c.uuid === input.collectionUuid,
        )

        if (!alreadyInCollection) {
          await addBooksToCollections(
            [input.collectionUuid],
            [globalMatch.uuid],
          )
        }
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

      const created = await createNewBook(
        bookPath,
        input.collectionUuid,
        importMode,
        newSkipPaths,
      )
      if (!created) continue

      const discoveredFormats = getBookPathFormats(bookPath)
      addFormats(result.formatsByBook, created.uuid, discoveredFormats)
      addFormats(result.newFormatsByBook, created.uuid, discoveredFormats)
      collectUnclassifiedEpubs(
        created.uuid,
        bookPath,
        result.unclassifiedEpubs,
        newSkipPaths,
      )

      currentScoped.push(created)
      currentAll.push(created)
      continue
    }

    if (!hasAnyRelationChange(scopedMatch, bookPath)) continue

    const updated = await attachNewRelations(
      scopedMatch,
      bookPath,
      importMode,
      newSkipPaths,
    )
    addFormats(result.formatsByBook, updated.book.uuid, updated.newFormats)
    addFormats(result.newFormatsByBook, updated.book.uuid, updated.newFormats)
    collectUnclassifiedEpubs(
      scopedMatch.uuid,
      bookPath,
      result.unclassifiedEpubs,
      newSkipPaths,
    )

    currentScoped = currentScoped.map((book) =>
      book.uuid === updated.book.uuid ? updated.book : book,
    )
    currentAll = currentAll.map((book) =>
      book.uuid === updated.book.uuid ? updated.book : book,
    )
  }

  // persist skip paths populated by createNewBook / attachNewRelations
  // (reference mode keeps the original file in the import dir; copy/hardlink
  // keep the source). without this, those files get re-discovered next scan.
  if (newSkipPaths.length > 0) {
    await addImportSkipPaths(newSkipPaths)
  }

  return result
}
