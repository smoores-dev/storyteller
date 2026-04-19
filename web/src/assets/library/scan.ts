import {
  type BookWithRelations,
  getBookByAudiobookFilepathPrefix,
  getBooks,
} from "@/database/books"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

import {
  type ImportPathChange,
  coalesceChanges,
  getDiscoveryRootsFromChanges,
  isWithinPath,
  pathsOverlap,
} from "./changes"
import {
  type BookPath,
  attachNewRelations,
  createNewBook,
  discoverBookPathsForRoots,
  findMatchingBook,
  getBookPathFormats,
  hasAnyRelationChange,
} from "./discovery"
import {
  buildScanContexts,
  getScopedBooks,
  registerFormats,
  updateReadaloudMissingState,
} from "./scanHelpers"
import {
  type ScanFormat,
  createScanContext,
  runBookScanPipeline,
} from "./scanner"

export type { ImportPathChange } from "./changes"

type UnclassifiedEpub = {
  bookUuid: UUID
  filepath: string
}

function getAffectedFormatsFromChanges(
  books: BookWithRelations[],
  changes: ImportPathChange[],
): Map<UUID, Set<ScanFormat>> {
  const affected = new Map<UUID, Set<ScanFormat>>()

  for (const change of changes) {
    for (const book of books) {
      const formats: ScanFormat[] = []

      if (
        book.ebook?.filepath &&
        pathsOverlap(book.ebook.filepath, change.path)
      ) {
        formats.push("ebook")
      }

      if (
        book.audiobook?.filepath &&
        pathsOverlap(book.audiobook.filepath, change.path)
      ) {
        formats.push("audiobook")
      }

      if (
        book.readaloud?.filepath &&
        pathsOverlap(book.readaloud.filepath, change.path)
      ) {
        formats.push("readaloud")
      }

      registerFormats(affected, book.uuid, formats)
    }
  }

  return affected
}

function collectUnclassifiedEpubs(
  bookUuid: UUID,
  bookPath: BookPath,
  out: UnclassifiedEpub[],
) {
  if (!bookPath.epubUnknown?.length) {
    return
  }

  for (const filepath of bookPath.epubUnknown) {
    out.push({ bookUuid, filepath })
  }
}

async function reconcileDiscoveredPaths(
  bookPaths: BookPath[],
  collectionUuid: UUID | null,
  allBooks: BookWithRelations[],
  scopedBooks: BookWithRelations[],
  formatsByBook: Map<UUID, Set<ScanFormat>>,
  newFormatsByBook: Map<UUID, Set<ScanFormat>> | null,
  unclassifiedEpubs: UnclassifiedEpub[],
  signal: AbortSignal,
): Promise<{
  allBooks: BookWithRelations[]
  scopedBooks: BookWithRelations[]
}> {
  let currentAll = allBooks
  let currentScoped = scopedBooks

  for (const bookPath of bookPaths) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (signal.aborted) {
      break
    }

    const globalMatch = findMatchingBook(currentAll, bookPath)
    const scopedMatch =
      globalMatch && currentScoped.some((b) => b.uuid === globalMatch.uuid)
        ? globalMatch
        : null

    if (globalMatch && !scopedMatch) {
      logger.warn(
        `File at ${JSON.stringify(bookPath)} already belongs to book "${globalMatch.title}" in another collection, skipping`,
      )
      continue
    }

    if (!scopedMatch) {
      if (bookPath.audiobook) {
        const nestedBook = await getBookByAudiobookFilepathPrefix(
          bookPath.audiobook,
        )

        if (nestedBook) {
          logger.warn(
            `Found a new audiobook file in the folder ${bookPath.audiobook}, but the book ${nestedBook.title} already has audiobook files at ${nestedBook.audiobookFilepath}: skipping. Please place all files within book-specific folders: https://storyteller-platform.gitlab.io/storyteller/docs/managing/adding#organizing-your-auto-import-folder.`,
          )
          continue
        }
      }

      try {
        const created = await createNewBook(bookPath, collectionUuid)
        if (!created) {
          continue
        }

        const discoveredFormats = getBookPathFormats(bookPath)
        registerFormats(formatsByBook, created.uuid, discoveredFormats)
        if (newFormatsByBook) {
          registerFormats(newFormatsByBook, created.uuid, discoveredFormats)
        }

        collectUnclassifiedEpubs(created.uuid, bookPath, unclassifiedEpubs)
        currentScoped.push(created)
        currentAll.push(created)
      } catch (error) {
        logger.error(
          `Encountered issue attempting to import from ${JSON.stringify(bookPath)}, skipping`,
        )
        logger.error(error)
      }
      continue
    }

    if (!hasAnyRelationChange(scopedMatch, bookPath)) {
      continue
    }

    const updated = await attachNewRelations(scopedMatch, bookPath)
    registerFormats(formatsByBook, updated.book.uuid, updated.newFormats)
    if (newFormatsByBook) {
      registerFormats(newFormatsByBook, updated.book.uuid, updated.newFormats)
    }

    collectUnclassifiedEpubs(scopedMatch.uuid, bookPath, unclassifiedEpubs)

    currentScoped = currentScoped.map((book) =>
      book.uuid === updated.book.uuid ? updated.book : book,
    )
    currentAll = currentAll.map((book) =>
      book.uuid === updated.book.uuid ? updated.book : book,
    )
  }

  return { allBooks: currentAll, scopedBooks: currentScoped }
}

function buildUnclassifiedEpubContexts(
  unclassified: UnclassifiedEpub[],
  refreshedBooks: BookWithRelations[],
) {
  return unclassified.map(({ bookUuid, filepath }) => {
    const book = refreshedBooks.find((b) => b.uuid === bookUuid) ?? null

    return createScanContext({
      bookUuid,
      format: "epub-unknown",
      filepath,
      missing: false,
      existingHash: null,
      flags: ["new"],
      book,
    })
  })
}

export async function scan(
  importPath: string,
  collectionUuid: UUID | null,
  signal: AbortSignal,
): Promise<Set<UUID>> {
  const scannedBookUuids = new Set<UUID>()

  logger.debug(`Starting new scan for ${importPath}`)
  const allBooks = await getBooks()
  if (signal.aborted) {
    return scannedBookUuids
  }

  const scopedBooks = getScopedBooks(allBooks, collectionUuid)
  const knownEbookPaths = new Set(
    scopedBooks
      .map((book) => book.ebook?.filepath)
      .filter((p): p is string => !!p),
  )
  const knownReadaloudPaths = new Set(
    scopedBooks
      .map((book) => book.readaloud?.filepath)
      .filter((p): p is string => !!p),
  )

  const bookPaths = await discoverBookPathsForRoots(
    [
      {
        rootPath: importPath,
        warnIfFileAtRoot: true,
      },
    ],
    knownEbookPaths,
    knownReadaloudPaths,
    signal,
  )
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (signal.aborted) {
    return scannedBookUuids
  }

  logger.debug(
    `Discovered ${bookPaths.length} book folder(s), checking for new or changed books`,
  )

  const newFlagsByBook = new Map<UUID, Set<ScanFormat>>()
  const unclassifiedEpubs: UnclassifiedEpub[] = []

  await reconcileDiscoveredPaths(
    bookPaths,
    collectionUuid,
    allBooks,
    scopedBooks,
    newFlagsByBook,
    null,
    unclassifiedEpubs,
    signal,
  )

  const refreshedBooks = getScopedBooks(await getBooks(), collectionUuid)

  const contexts = [
    ...buildScanContexts(refreshedBooks, { newFormats: newFlagsByBook }),
    ...buildUnclassifiedEpubContexts(unclassifiedEpubs, refreshedBooks),
  ]

  await runBookScanPipeline(contexts, { concurrency: 2, signal })
  await updateReadaloudMissingState(refreshedBooks, signal)

  for (const ctx of contexts) {
    scannedBookUuids.add(ctx.bookUuid)
  }

  logger.info(
    `Import scan complete for ${importPath}. found ${bookPaths.length} book(s), scanned ${contexts.length} format(s)`,
  )

  return scannedBookUuids
}

export async function scanChangedPaths(
  importPath: string,
  collectionUuid: UUID | null,
  changes: ImportPathChange[],
  signal: AbortSignal,
) {
  const normalizedChanges = coalesceChanges(changes).filter((change) =>
    isWithinPath(importPath, change.path),
  )

  if (!normalizedChanges.length) {
    logger.debug(`No relevant changes detected for ${importPath}`)
    return
  }

  logger.debug(
    `Starting incremental scan for ${importPath} with ${normalizedChanges.length} change(s)`,
  )

  const allBooks = await getBooks()
  if (signal.aborted) {
    return
  }

  const scopedBooks = getScopedBooks(allBooks, collectionUuid)
  const affectedFormatsByBook = getAffectedFormatsFromChanges(
    scopedBooks,
    normalizedChanges,
  )
  const newFormatsByBook = new Map<UUID, Set<ScanFormat>>()
  const unclassifiedEpubs: UnclassifiedEpub[] = []

  const knownEbookPaths = new Set(
    scopedBooks
      .map((book) => book.ebook?.filepath)
      .filter((p): p is string => !!p),
  )
  const knownReadaloudPaths = new Set(
    scopedBooks
      .map((book) => book.readaloud?.filepath)
      .filter((p): p is string => !!p),
  )

  const discoveryRoots = getDiscoveryRootsFromChanges(
    importPath,
    normalizedChanges,
  )

  if (discoveryRoots.length) {
    const discoveredBookPaths = await discoverBookPathsForRoots(
      discoveryRoots.map((rootPath) => ({
        rootPath,
        warnIfFileAtRoot: false,
      })),
      knownEbookPaths,
      knownReadaloudPaths,
      signal,
    )

    await reconcileDiscoveredPaths(
      discoveredBookPaths,
      collectionUuid,
      allBooks,
      scopedBooks,
      affectedFormatsByBook,
      newFormatsByBook,
      unclassifiedEpubs,
      signal,
    )
  }

  const hasAffected = affectedFormatsByBook.size > 0
  const hasUnclassified = unclassifiedEpubs.length > 0

  if (!hasAffected && !hasUnclassified) {
    logger.debug(`No affected books found for ${importPath}`)
    return
  }

  const refreshedBooks = getScopedBooks(await getBooks(), collectionUuid)

  const contexts = [
    ...buildScanContexts(refreshedBooks, {
      formatFilter: affectedFormatsByBook,
      newFormats: newFormatsByBook,
    }),
    ...buildUnclassifiedEpubContexts(unclassifiedEpubs, refreshedBooks),
  ]

  if (!contexts.length) {
    logger.debug(`No scan contexts generated for ${importPath}`)
    return
  }

  await runBookScanPipeline(contexts, { concurrency: 2, signal })
  await updateReadaloudMissingState(
    refreshedBooks.filter((book) => affectedFormatsByBook.has(book.uuid)),
    signal,
  )

  logger.info(
    `Incremental scan complete for ${importPath}. processed ${affectedFormatsByBook.size} book(s)`,
  )
}
