import {
  type ImportPathChange,
  coalesceChanges,
  getDiscoveryRootsFromChanges,
  isWithinPath,
  pathsOverlap,
} from "@/assets/library/changes"
import { discoverBookPathsForRoots } from "@/assets/library/discovery"
import {
  type UnclassifiedEpub,
  reconcileDiscoveredPaths,
} from "@/assets/library/reconcile"
import { type BookWithRelations, getBooks } from "@/database/books"
import { getCollections } from "@/database/collections"
import { getSetting } from "@/database/settings"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

import { type ScanCtx, type ScanOptions, type ScanSource } from "./ctx"
import { runScans } from "./runScans"
import { ScanReport } from "./scanReport"
import { pushRecentReport, withScanLock } from "./state"
import { type ScanFormat, type ScanInput } from "./types"

export type ScanTask =
  | { kind: "import-path"; importPath: string; collection: UUID | "root" }
  | {
      kind: "changed-paths"
      importPath: string
      collection: UUID | "root"
      changes: ImportPathChange[]
    }
  | { kind: "existing-books"; bookUuids?: UUID[]; exclude?: Set<UUID> }

export type ScanResult = {
  scannedBookUuids: Set<UUID>
  processedInputs: number
  report: ScanReport | null
}

export { cancelActiveScan, getRecentScanReports, getScanState } from "./state"

function defaultConcurrency(source: ScanSource): number {
  return source === "watcher" ? 2 : 8
}

function toCollectionUuid(collection: UUID | "root"): UUID | null {
  return collection === "root" ? null : collection
}

function scopedByCollection(
  books: BookWithRelations[],
  collectionUuid: UUID | "root",
): BookWithRelations[] {
  if (collectionUuid === "root") return books

  return books.filter((book) =>
    book.collections.some((c) => c.uuid === collectionUuid),
  )
}

function dedupeInputs(inputs: ScanInput[]): ScanInput[] {
  const seen = new Map<string, ScanInput>()
  for (const input of inputs) {
    const key = `${input.bookUuid}:${input.format}:${input.filepath}`
    const existing = seen.get(key)
    if (!existing || input.isNew) seen.set(key, input)
  }
  return Array.from(seen.values())
}

function buildInputsForBooks(
  books: BookWithRelations[],
  opts: {
    formatFilter?: Map<UUID, Set<ScanFormat>>
    newFormats?: Map<UUID, Set<ScanFormat>>
  } = {},
): ScanInput[] {
  const inputs: ScanInput[] = []

  for (const book of books) {
    const allowed = opts.formatFilter?.get(book.uuid)
    const newFormats = opts.newFormats?.get(book.uuid)
    const isNewFor = (format: ScanFormat) => !!newFormats?.has(format)

    if (book.ebook?.filepath && (!allowed || allowed.has("ebook"))) {
      inputs.push({
        bookUuid: book.uuid,
        filepath: book.ebook.filepath,
        format: "ebook",
        book,
        isNew: isNewFor("ebook"),
        missing: book.ebook.missing,
        existingHash: book.ebook.contentHash ?? null,
        existingFingerprint: book.ebook.fingerprint ?? null,
      })
    }

    if (book.audiobook?.filepath && (!allowed || allowed.has("audiobook"))) {
      inputs.push({
        bookUuid: book.uuid,
        filepath: book.audiobook.filepath,
        format: "audiobook",
        book,
        isNew: isNewFor("audiobook"),
        missing: book.audiobook.missing,
        existingHash: book.audiobook.contentHash ?? null,
        existingFingerprint: book.audiobook.fingerprint ?? null,
      })
    }

    if (book.readaloud?.filepath && (!allowed || allowed.has("readaloud"))) {
      inputs.push({
        bookUuid: book.uuid,
        filepath: book.readaloud.filepath,
        format: "readaloud",
        book,
        isNew: isNewFor("readaloud"),
        missing: book.readaloud.missing,
        existingHash: book.readaloud.contentHash ?? null,
        existingFingerprint: book.readaloud.fingerprint ?? null,
      })
    }
  }

  return inputs
}

function formatsAffectedByChanges(
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

      if (formats.length) {
        const existing = affected.get(book.uuid) ?? new Set<ScanFormat>()
        for (const format of formats) existing.add(format)
        affected.set(book.uuid, existing)
      }
    }
  }

  return affected
}

type TaskResolution = {
  inputs: ScanInput[]
}

const EMPTY_RESOLUTION: TaskResolution = { inputs: [] }

async function resolveImportPath(
  task: Extract<ScanTask, { kind: "import-path" }>,
  ctx: ScanCtx,
): Promise<TaskResolution> {
  const allBooks = await getBooks()
  if (ctx.signal.aborted) return EMPTY_RESOLUTION

  const scoped = scopedByCollection(allBooks, task.collection)
  const knownEbookPaths = new Set(
    scoped.map((b) => b.ebook?.filepath).filter((p): p is string => !!p),
  )
  const knownReadaloudPaths = new Set(
    scoped.map((b) => b.readaloud?.filepath).filter((p): p is string => !!p),
  )

  const bookPaths = await discoverBookPathsForRoots(
    [{ rootPath: task.importPath, warnIfFileAtRoot: true }],
    knownEbookPaths,
    knownReadaloudPaths,
    ctx.signal,
  )

  const reconciled = await reconcileDiscoveredPaths({
    bookPaths,
    collectionUuid: toCollectionUuid(task.collection),
    allBooks,
    scopedBooks: scoped,
    signal: ctx.signal,
  })

  reportDiscoveries(
    ctx,
    task.importPath,
    reconciled.newFormatsByBook,
    reconciled.unclassifiedEpubs,
  )

  const refreshedBooks = scopedByCollection(await getBooks(), task.collection)
  const inputs = buildInputsForBooks(refreshedBooks, {
    newFormats: reconciled.newFormatsByBook,
  })
  inputs.push(
    ...buildTentativeInputs(refreshedBooks, reconciled.unclassifiedEpubs),
  )

  return { inputs }
}

function buildTentativeInputs(
  books: BookWithRelations[],
  unclassified: UnclassifiedEpub[],
): ScanInput[] {
  if (!unclassified.length) return []
  const bookByUuid = new Map(books.map((book) => [book.uuid, book]))
  const inputs: ScanInput[] = []
  for (const { bookUuid, filepath } of unclassified) {
    const book = bookByUuid.get(bookUuid)
    if (!book) continue
    inputs.push({
      bookUuid,
      filepath,
      format: "ebook",
      formatTentative: true,
      book,
      isNew: true,
      missing: false,
      existingHash: null,
      existingFingerprint: null,
    })
  }
  return inputs
}

function reportDiscoveries(
  ctx: ScanCtx,
  importPath: string,
  newFormatsByBook: Map<UUID, Set<ScanFormat>>,
  unclassified: UnclassifiedEpub[],
) {
  const tentativeBookUuids = new Set(unclassified.map((u) => u.bookUuid))
  if (newFormatsByBook.size === 0 && tentativeBookUuids.size === 0) return

  let formatCount = 0
  const bookUuids = new Set<UUID>(tentativeBookUuids)
  for (const [bookUuid, formats] of newFormatsByBook) {
    bookUuids.add(bookUuid)
    formatCount += formats.size
  }
  for (const bookUuid of bookUuids) {
    ctx.report.recordAdded(bookUuid)
  }

  const parts = [`${bookUuids.size} book(s)`]
  if (formatCount > 0) parts.push(`${formatCount} format(s)`)
  if (unclassified.length > 0) {
    parts.push(`${unclassified.length} unclassified epub(s)`)
  }
  ctx.report.info({
    step: "discover",
    msg: `Discovered ${parts.join("/")} under ${importPath}`,
  })
}

async function resolveChangedPaths(
  task: Extract<ScanTask, { kind: "changed-paths" }>,
  ctx: ScanCtx,
): Promise<TaskResolution> {
  const normalized = coalesceChanges(task.changes).filter((c) =>
    isWithinPath(task.importPath, c.path),
  )
  if (!normalized.length) return EMPTY_RESOLUTION

  const allBooks = await getBooks()
  if (ctx.signal.aborted) return EMPTY_RESOLUTION

  const scoped = scopedByCollection(allBooks, task.collection)
  const affectedFormats = formatsAffectedByChanges(scoped, normalized)

  const knownEbookPaths = new Set(
    scoped.map((b) => b.ebook?.filepath).filter((p): p is string => !!p),
  )
  const knownReadaloudPaths = new Set(
    scoped.map((b) => b.readaloud?.filepath).filter((p): p is string => !!p),
  )
  const discoveryRoots = getDiscoveryRootsFromChanges(
    task.importPath,
    normalized,
  )

  let newFormatsByBook = new Map<UUID, Set<ScanFormat>>()
  let unclassifiedEpubs: UnclassifiedEpub[] = []

  if (discoveryRoots.length) {
    const discovered = await discoverBookPathsForRoots(
      discoveryRoots.map((rootPath) => ({ rootPath, warnIfFileAtRoot: false })),
      knownEbookPaths,
      knownReadaloudPaths,
      ctx.signal,
    )

    const reconciled = await reconcileDiscoveredPaths({
      bookPaths: discovered,
      collectionUuid: toCollectionUuid(task.collection),
      allBooks,
      scopedBooks: scoped,
      signal: ctx.signal,
    })

    // Merge discovery-reconciled formats into the change-detected formats.
    for (const [uuid, formats] of reconciled.formatsByBook) {
      const existing = affectedFormats.get(uuid) ?? new Set<ScanFormat>()
      for (const format of formats) existing.add(format)
      affectedFormats.set(uuid, existing)
    }
    newFormatsByBook = reconciled.newFormatsByBook
    unclassifiedEpubs = reconciled.unclassifiedEpubs

    reportDiscoveries(ctx, task.importPath, newFormatsByBook, unclassifiedEpubs)
  }

  if (!affectedFormats.size && !unclassifiedEpubs.length) {
    return EMPTY_RESOLUTION
  }

  const refreshedBooks = scopedByCollection(await getBooks(), task.collection)
  const inputs = buildInputsForBooks(refreshedBooks, {
    formatFilter: affectedFormats,
    newFormats: newFormatsByBook,
  })
  inputs.push(...buildTentativeInputs(refreshedBooks, unclassifiedEpubs))
  logger.debug({
    msg: "Resolved changed paths",
    importPath: task.importPath,
    collection: task.collection,
    changes: task.changes,
  })

  if (!inputs.length) return EMPTY_RESOLUTION

  return { inputs }
}

async function resolveExistingBooks(
  task: Extract<ScanTask, { kind: "existing-books" }>,
  alreadyScanned: Set<UUID>,
  ctx: ScanCtx,
): Promise<TaskResolution> {
  const books = await getBooks(task.bookUuids ?? null)
  if (ctx.signal.aborted) return EMPTY_RESOLUTION

  const exclude = new Set([...alreadyScanned, ...(task.exclude ?? [])])
  const filtered =
    exclude.size > 0 ? books.filter((b) => !exclude.has(b.uuid)) : books

  return { inputs: buildInputsForBooks(filtered) }
}

export async function scan(opts: {
  source: ScanSource
  tasks: ScanTask[]
  options?: ScanOptions
  signal: AbortSignal
}): Promise<ScanResult> {
  const options: ScanOptions = {
    concurrency: defaultConcurrency(opts.source),
    ...(opts.options ?? {}),
  }
  const startedAt = Date.now()
  const report = new ScanReport(
    logger.child({ ctx: `[SCAN:${opts.source}]` }),
    startedAt,
    opts.source,
  )
  const taskKinds = opts.tasks.map((t) => t.kind)
  report.setTasks(taskKinds)
  report.logger.info(
    `Scan started (${taskKinds.length} task${taskKinds.length === 1 ? "" : "s"}: ${taskKinds.join(", ")})`,
  )

  // internal controller that can be aborted from the cancel endpoint.
  // forwards abort from the caller's signal so both paths cancel the scan.
  const scanController = new AbortController()

  if (opts.signal.aborted) {
    scanController.abort()
  } else {
    opts.signal.addEventListener(
      "abort",
      () => {
        scanController.abort()
      },
      { once: true },
    )
  }

  const locked = await withScanLock(
    opts.source,
    startedAt,
    scanController,
    async (setProgress) => {
      if (scanController.signal.aborted) {
        return { scannedBookUuids: new Set<UUID>(), processedInputs: 0 }
      }

      const ctx: ScanCtx = {
        signal: scanController.signal,
        report,
        logger: report.logger,
        source: opts.source,
        options,
        setProgress,
      }

      const scannedBookUuids = new Set<UUID>()
      const allInputs: ScanInput[] = []

      for (const task of opts.tasks) {
        if (ctx.signal.aborted) {
          break
        }

        let resolved: TaskResolution | null = null
        if (task.kind === "import-path") {
          resolved = await resolveImportPath(task, ctx)
        } else if (task.kind === "changed-paths") {
          resolved = await resolveChangedPaths(task, ctx)
        }

        if (!resolved) continue
        for (const input of resolved.inputs)
          scannedBookUuids.add(input.bookUuid)
        allInputs.push(...resolved.inputs)
      }

      const existingBookTask = opts.tasks.find(
        (task) => task.kind === "existing-books",
      )
      if (existingBookTask) {
        const resolved = await resolveExistingBooks(
          existingBookTask,
          scannedBookUuids,
          ctx,
        )
        for (const input of resolved.inputs)
          scannedBookUuids.add(input.bookUuid)
        allInputs.push(...resolved.inputs)
      }

      if (ctx.signal.aborted || !allInputs.length) {
        return { scannedBookUuids, processedInputs: 0 }
      }

      const inputs = dedupeInputs(allInputs)
      report.setInputsTotal(inputs.length)

      await runScans(
        inputs,
        ctx,
        options.concurrency ?? defaultConcurrency(opts.source),
      )

      return { scannedBookUuids, processedInputs: inputs.length }
    },
  )

  report.finish()
  report.logger.info({ msg: report.formatSummary() })
  pushRecentReport(report)

  return {
    scannedBookUuids: locked?.scannedBookUuids ?? new Set<UUID>(),
    processedInputs: locked?.processedInputs ?? 0,
    report,
  }
}

export async function scanLibrary(opts: {
  source: ScanSource
  options?: ScanOptions
  signal: AbortSignal
}): Promise<ScanResult> {
  const [rootImportPaths, collections] = await Promise.all([
    getSetting("importPath"),
    getCollections(),
  ])

  const tasks: ScanTask[] = []

  if (rootImportPaths) {
    for (const importPath of rootImportPaths) {
      tasks.push({ kind: "import-path", importPath, collection: "root" })
    }
  }

  for (const collection of collections) {
    const paths = collection.importPaths
    if (!paths || paths.length === 0) continue

    for (const importPath of paths) {
      tasks.push({
        kind: "import-path",
        importPath,
        collection: collection.uuid,
      })
    }
  }

  tasks.push({ kind: "existing-books" })

  return scan({
    source: opts.source,
    tasks,
    options: opts.options ?? {},
    signal: opts.signal,
  })
}

export async function scanBooks(opts: {
  source: ScanSource
  bookUuids: UUID[]
  options?: ScanOptions
  signal: AbortSignal
}): Promise<ScanResult> {
  return scan({
    source: opts.source,
    tasks: [{ kind: "existing-books", bookUuids: opts.bookUuids }],
    options: opts.options ?? {},
    signal: opts.signal,
  })
}
