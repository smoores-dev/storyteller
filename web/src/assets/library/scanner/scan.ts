import {
  type ImportPathChange,
  coalesceChanges,
  getDiscoveryRootsFromChanges,
  isWithinPath,
  pathsOverlap,
} from "@/assets/library/changes"
import { discoverBookPathsForRoots } from "@/assets/library/discovery"
import { reconcileDiscoveredPaths } from "@/assets/library/reconcile"
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
  | { kind: "import-path"; importPath: string; collection: UUID | null }
  | {
      kind: "changed-paths"
      importPath: string
      collection: UUID | null
      changes: ImportPathChange[]
    }
  | { kind: "existing-books"; bookUuids?: UUID[]; exclude?: Set<UUID> }

export type ScanResult = {
  scannedBookUuids: Set<UUID>
  processedInputs: number
  report: ScanReport | null
}

export { getRecentScanReports, getScanState } from "./state"

function defaultConcurrency(source: ScanSource): number {
  return source === "watcher" ? 2 : 8
}

function scopedByCollection(
  books: BookWithRelations[],
  collectionUuid: UUID | null,
): BookWithRelations[] {
  if (!collectionUuid) return books
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
      })
    }
  }

  return inputs
}

function buildUnclassifiedInputs(
  unclassified: { bookUuid: UUID; filepath: string }[],
  books: BookWithRelations[],
): ScanInput[] {
  return unclassified.flatMap(({ bookUuid, filepath }) => {
    const book = books.find((b) => b.uuid === bookUuid)
    if (!book) return []
    return [
      {
        bookUuid,
        filepath,
        format: "epub-unknown" as const,
        book,
        isNew: true,
        missing: false,
        existingHash: null,
      },
    ]
  })
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
    collectionUuid: task.collection,
    allBooks,
    scopedBooks: scoped,
    signal: ctx.signal,
  })

  const refreshedBooks = scopedByCollection(await getBooks(), task.collection)
  const inputs = [
    ...buildInputsForBooks(refreshedBooks, {
      newFormats: reconciled.newFormatsByBook,
    }),
    ...buildUnclassifiedInputs(reconciled.unclassifiedEpubs, refreshedBooks),
  ]

  return { inputs }
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
  let unclassifiedEpubs: { bookUuid: UUID; filepath: string }[] = []

  if (discoveryRoots.length) {
    const discovered = await discoverBookPathsForRoots(
      discoveryRoots.map((rootPath) => ({ rootPath, warnIfFileAtRoot: false })),
      knownEbookPaths,
      knownReadaloudPaths,
      ctx.signal,
    )

    const reconciled = await reconcileDiscoveredPaths({
      bookPaths: discovered,
      collectionUuid: task.collection,
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
  }

  if (!affectedFormats.size && !unclassifiedEpubs.length) {
    return EMPTY_RESOLUTION
  }

  const refreshedBooks = scopedByCollection(await getBooks(), task.collection)
  const inputs = [
    ...buildInputsForBooks(refreshedBooks, {
      formatFilter: affectedFormats,
      newFormats: newFormatsByBook,
    }),
    ...buildUnclassifiedInputs(unclassifiedEpubs, refreshedBooks),
  ]

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

  const locked = await withScanLock(
    opts.source,
    startedAt,
    async (setProgress) => {
      if (opts.signal.aborted) {
        return { scannedBookUuids: new Set<UUID>(), processedInputs: 0 }
      }

      const ctx: ScanCtx = {
        signal: opts.signal,
        report,
        logger: report.logger,
        source: opts.source,
        options,
        setProgress,
      }

      const scannedBookUuids = new Set<UUID>()
      const allInputs: ScanInput[] = []

      for (const task of opts.tasks) {
        if (ctx.signal.aborted) break

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

      for (const task of opts.tasks) {
        if (ctx.signal.aborted) break
        if (task.kind !== "existing-books") continue

        const resolved = await resolveExistingBooks(task, scannedBookUuids, ctx)
        for (const input of resolved.inputs)
          scannedBookUuids.add(input.bookUuid)
        allInputs.push(...resolved.inputs)
      }

      if (ctx.signal.aborted || !allInputs.length) {
        return { scannedBookUuids, processedInputs: 0 }
      }

      const inputs = dedupeInputs(allInputs)
      report.info({
        step: "scan-run",
        msg: `Running scan (${opts.source}): ${inputs.length} input(s)`,
      })

      await runScans(
        inputs,
        ctx,
        options.concurrency ?? defaultConcurrency(opts.source),
      )

      return { scannedBookUuids, processedInputs: inputs.length }
    },
  )

  report.finish()
  report.logger.info({ step: "scan-run", msg: "Scan finished" })
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
      tasks.push({ kind: "import-path", importPath, collection: null })
    }
  }
  for (const collection of collections) {
    if (!collection.importPath) continue
    tasks.push({
      kind: "import-path",
      importPath: collection.importPath,
      collection: collection.uuid,
    })
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
