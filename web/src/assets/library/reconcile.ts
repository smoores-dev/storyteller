import {
  type BookWithRelations,
  getBookByAudiobookFilepathPrefix,
} from "@/database/books"
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

  for (const bookPath of input.bookPaths) {
    if (input.signal.aborted) return result

    const globalMatch = findMatchingBook(currentAll, bookPath)
    const scopedMatch =
      globalMatch &&
      currentScoped.some((book) => book.uuid === globalMatch.uuid)
        ? globalMatch
        : null

    // book exists in another scope/collection — don't touch it here
    if (globalMatch && !scopedMatch) continue

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
      collectUnclassifiedEpubs(created.uuid, bookPath, result.unclassifiedEpubs)

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
