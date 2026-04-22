import { AsyncMutex } from "@esfx/async-mutex"

import {
  type BookWithRelations,
  getBookByAudiobookFilepathPrefix,
  getBooks,
} from "@/database/books"
import { getCollections } from "@/database/collections"
import { getSetting } from "@/database/settings"
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
  type ScanContext,
  type ScanFormat,
  type ScanOptions,
  createScanContext,
  runBookScanPipeline,
} from "./scanner/index"

export type { ImportPathChange } from "./changes"
export type { ScanOptions } from "./scanner/index"

// -- types ---------------------------------------------------------------

export type ScanSource = "watcher" | "manual" | "scheduled"

export type ScanTarget =
  | { type: "import-path"; importPath: string; collection: UUID | null }
  | {
      type: "changed-paths"
      importPath: string
      collection: UUID | null
      changes: ImportPathChange[]
    }
  | { type: "existing-books"; bookUuids?: UUID[]; exclude?: Set<UUID> }

export type ScanResult = {
  scannedBookUuids: Set<UUID>
  processedContexts: number
}

// -- lock and state ------------------------------------------------------

type ScanState = {
  running: boolean
  source: ScanSource | null
  startedAt: number | null
}

const lock = new AsyncMutex()

const state: ScanState = {
  running: false,
  source: null,
  startedAt: null,
}

export function getScanState(): ScanState {
  return { ...state }
}

async function runExclusive<T>(
  source: ScanSource,
  signal: AbortSignal,
  callback: () => Promise<T>,
): Promise<T | undefined> {
  await lock.lock()

  if (signal.aborted) {
    lock.unlock()
    return undefined
  }

  state.running = true
  state.source = source
  state.startedAt = Date.now()

  try {
    return await callback()
  } finally {
    state.running = false
    state.source = null
    state.startedAt = null
    lock.unlock()
  }
}

// -- internal helpers ----------------------------------------------------

type UnclassifiedEpub = {
  bookUuid: UUID
  filepath: string
}

type TargetResolution = {
  contexts: ScanContext[]
  affectedBooks: BookWithRelations[]
}

const EMPTY_RESOLUTION: TargetResolution = {
  contexts: [],
  affectedBooks: [],
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
  options: ScanOptions,
): ScanContext[] {
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
      options,
    })
  })
}

function deduplicateContexts(contexts: ScanContext[]): ScanContext[] {
  const seen = new Map<string, ScanContext>()

  for (const ctx of contexts) {
    const key = `${ctx.bookUuid}:${ctx.format}:${ctx.filepath}`
    const existing = seen.get(key)

    if (!existing || ctx.flags.has("new")) {
      seen.set(key, ctx)
    }
  }

  return Array.from(seen.values())
}

function deduplicateBooks(books: BookWithRelations[]): BookWithRelations[] {
  const seen = new Set<UUID>()

  return books.filter((book) => {
    if (seen.has(book.uuid)) {
      return false
    }

    seen.add(book.uuid)
    return true
  })
}

// -- Scan class ----------------------------------------------------------

export class Scan {
  readonly source: ScanSource
  readonly targets: ScanTarget[]
  readonly options: ScanOptions

  constructor(
    source: ScanSource,
    targets: ScanTarget[],
    options?: ScanOptions,
  ) {
    this.source = source
    this.targets = targets
    this.options = options ?? {}
  }

  static async fullLibrary(
    source: ScanSource,
    options?: ScanOptions,
  ): Promise<Scan> {
    const [rootImportPaths, collections] = await Promise.all([
      getSetting("importPath"),
      getCollections(),
    ])

    const targets: ScanTarget[] = []

    if (rootImportPaths) {
      for (const importPath of rootImportPaths) {
        targets.push({ type: "import-path", importPath, collection: null })
      }
    }

    for (const collection of collections) {
      if (collection.importPath) {
        targets.push({
          type: "import-path",
          importPath: collection.importPath,
          collection: collection.uuid,
        })
      }
    }

    targets.push({ type: "existing-books" })

    return new Scan(source, targets, options)
  }

  async execute(signal: AbortSignal): Promise<ScanResult> {
    const result = await runExclusive(this.source, signal, () =>
      this.run(signal),
    )

    return result ?? { scannedBookUuids: new Set(), processedContexts: 0 }
  }

  private async run(signal: AbortSignal): Promise<ScanResult> {
    const allContexts: ScanContext[] = []
    const scannedBookUuids = new Set<UUID>()
    const allAffectedBooks: BookWithRelations[] = []

    // phase 1: resolve import-path and changed-paths targets first,
    // since they may discover and create new book records
    for (const target of this.targets) {
      if (signal.aborted) {
        break
      }

      let resolved: TargetResolution | null = null

      if (target.type === "import-path") {
        resolved = await this.resolveImportPath(target, signal)
      } else if (target.type === "changed-paths") {
        resolved = await this.resolveChangedPaths(target, signal)
      }

      if (!resolved) {
        continue
      }

      for (const ctx of resolved.contexts) {
        scannedBookUuids.add(ctx.bookUuid)
      }

      allContexts.push(...resolved.contexts)
      allAffectedBooks.push(...resolved.affectedBooks)
    }

    // phase 2: resolve existing-books targets, deduplicating against phase 1
    for (const target of this.targets) {
      if (signal.aborted) {
        break
      }

      if (target.type !== "existing-books") {
        continue
      }

      const resolved = await this.resolveExistingBooks(
        target,
        scannedBookUuids,
        signal,
      )

      for (const ctx of resolved.contexts) {
        scannedBookUuids.add(ctx.bookUuid)
      }

      allContexts.push(...resolved.contexts)
      allAffectedBooks.push(...resolved.affectedBooks)
    }

    if (signal.aborted || !allContexts.length) {
      return { scannedBookUuids, processedContexts: 0 }
    }

    // phase 3: deduplicate and run pipeline
    const contexts = deduplicateContexts(allContexts)

    logger.info(
      `Running scan (${this.source}): ${contexts.length} context(s) across ${scannedBookUuids.size} book(s)`,
    )

    await runBookScanPipeline(contexts, { concurrency: 2, signal })

    // phase 4: post-process
    const uniqueBooks = deduplicateBooks(allAffectedBooks)
    await updateReadaloudMissingState(uniqueBooks, signal)

    return { scannedBookUuids, processedContexts: contexts.length }
  }

  private async resolveImportPath(
    target: Extract<ScanTarget, { type: "import-path" }>,
    signal: AbortSignal,
  ): Promise<TargetResolution> {
    const { importPath, collection } = target

    logger.debug(`Resolving import-path target: ${importPath}`)

    const allBooks = await getBooks()
    if (signal.aborted) {
      return EMPTY_RESOLUTION
    }

    const scopedBooks = getScopedBooks(allBooks, collection)

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
      [{ rootPath: importPath, warnIfFileAtRoot: true }],
      knownEbookPaths,
      knownReadaloudPaths,
      signal,
    )

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (signal.aborted) {
      return EMPTY_RESOLUTION
    }

    logger.debug(
      `Discovered ${bookPaths.length} book folder(s) in ${importPath}`,
    )

    const newFlagsByBook = new Map<UUID, Set<ScanFormat>>()
    const unclassifiedEpubs: UnclassifiedEpub[] = []

    await reconcileDiscoveredPaths(
      bookPaths,
      collection,
      allBooks,
      scopedBooks,
      newFlagsByBook,
      null,
      unclassifiedEpubs,
      signal,
    )

    const refreshedBooks = getScopedBooks(await getBooks(), collection)

    const contexts = [
      ...buildScanContexts(refreshedBooks, {
        newFormats: newFlagsByBook,
        scanOptions: this.options,
      }),
      ...buildUnclassifiedEpubContexts(
        unclassifiedEpubs,
        refreshedBooks,
        this.options,
      ),
    ]

    logger.info(
      `Import scan resolved for ${importPath}: ${bookPaths.length} book(s), ${contexts.length} format(s)`,
    )

    return { contexts, affectedBooks: refreshedBooks }
  }

  private async resolveChangedPaths(
    target: Extract<ScanTarget, { type: "changed-paths" }>,
    signal: AbortSignal,
  ): Promise<TargetResolution> {
    const { importPath, collection, changes } = target

    const normalizedChanges = coalesceChanges(changes).filter((change) =>
      isWithinPath(importPath, change.path),
    )

    if (!normalizedChanges.length) {
      logger.debug(`No relevant changes detected for ${importPath}`)
      return EMPTY_RESOLUTION
    }

    logger.debug(
      `Resolving changed-paths target for ${importPath}: ${normalizedChanges.length} change(s)`,
    )

    const allBooks = await getBooks()
    if (signal.aborted) {
      return EMPTY_RESOLUTION
    }

    const scopedBooks = getScopedBooks(allBooks, collection)

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
        collection,
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
      return EMPTY_RESOLUTION
    }

    const refreshedBooks = getScopedBooks(await getBooks(), collection)

    const contexts = [
      ...buildScanContexts(refreshedBooks, {
        formatFilter: affectedFormatsByBook,
        newFormats: newFormatsByBook,
        scanOptions: this.options,
      }),
      ...buildUnclassifiedEpubContexts(
        unclassifiedEpubs,
        refreshedBooks,
        this.options,
      ),
    ]

    if (!contexts.length) {
      logger.debug(`No scan contexts generated for ${importPath}`)
      return EMPTY_RESOLUTION
    }

    logger.info(
      `Changed-paths scan resolved for ${importPath}: ${affectedFormatsByBook.size} book(s), ${contexts.length} context(s)`,
    )

    const affectedBooks = refreshedBooks.filter((book) =>
      affectedFormatsByBook.has(book.uuid),
    )

    return { contexts, affectedBooks }
  }

  private async resolveExistingBooks(
    target: Extract<ScanTarget, { type: "existing-books" }>,
    alreadyScanned: Set<UUID>,
    signal: AbortSignal,
  ): Promise<TargetResolution> {
    const books = await getBooks(target.bookUuids ?? null)

    if (signal.aborted) {
      return EMPTY_RESOLUTION
    }

    const combinedExclude = new Set([
      ...alreadyScanned,
      ...(target.exclude ?? []),
    ])

    const filteredBooks =
      combinedExclude.size > 0
        ? books.filter((book) => !combinedExclude.has(book.uuid))
        : books

    const contexts = buildScanContexts(filteredBooks, {
      scanOptions: this.options,
    })

    logger.info(
      `Existing-books scan resolved: ${contexts.length} context(s) from ${filteredBooks.length} book(s)`,
    )

    return { contexts, affectedBooks: filteredBooks }
  }
}
