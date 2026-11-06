import { filepathFolder, pathBelongsTo } from "@/assets/library/paths"
import { type BookWithRelations, getBooks } from "@/database/books"
import { getWatchRules } from "@/database/importRules"
import { getSetting } from "@/database/settings"
import {
  type Epub2ImportStrategy,
  type ImportMode,
} from "@/database/settingsTypes"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

import {
  type PipelineCtx,
  type ScanCtx,
  type ScanOptions,
  type ScanSource,
} from "./ctx"
import { canonicalizePath, listBookCandidates, walkFolders } from "./folder"
import { ingestCandidate } from "./ingest"
import { reportDelta, snapshot } from "./memoryReport"
import { scanAudiobook } from "./pipelines/scanAudiobook"
import { scanEbook } from "./pipelines/scanEbook"
import { ScanReport } from "./scanReport"
import { pushRecentReport, withScanLock } from "./state"
import { ScanAbortedError } from "./step"
import { type Candidate } from "./types"

export type ScanRequest =
  | { kind: "folders"; folders: string[]; collections?: UUID[] }
  | {
      kind: "roots"
      roots: {
        path: string
        collections?: UUID[]
        importMode?: ImportMode
        epub2ImportStrategy?: Epub2ImportStrategy
      }[]
      includeOrphanedBooks?: boolean
    }
  | { kind: "candidates"; candidates: Candidate[] }
  | { kind: "books"; bookUuids: UUID[] }

export type ScanResult = {
  scannedBookUuids: Set<UUID>
  processedCandidates: number
  report: ScanReport | null
}

export { cancelActiveScan, getRecentScanReports, getScanState } from "./state"

function defaultConcurrency(source: ScanSource): number {
  switch (source) {
    case "watcher":
    case "upload":
    case "readaloud-creation":
      return 1
    case "manual":
    case "scheduled":
    case "api":
      return 2
  }
}

function dedupeCandidates(candidates: Candidate[]): Candidate[] {
  const seen = new Map<string, Candidate>()
  for (const candidate of candidates) {
    const key = `${candidate.folder}::${candidate.format}::${candidate.filepath}`
    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, candidate)
      continue
    }
    // prefer the candidate that has more context (existingBook/hint)
    if (!existing.existingBook && candidate.existingBook) {
      seen.set(key, candidate)
    } else if (!existing.bookUuidHint && candidate.bookUuidHint) {
      seen.set(key, candidate)
    }
  }
  return [...seen.values()]
}

function candidatesFromExistingBook(book: BookWithRelations): Candidate[] {
  const out: Candidate[] = []
  // existing-book candidates skip relocate (paths are typically already
  // internal or the user originally chose reference mode), so we don't stamp
  // them with an importMode.
  if (book.ebook?.filepath) {
    out.push({
      folder: filepathFolder(book.ebook.filepath),
      format: "ebook",
      filepath: book.ebook.filepath,
      existingBook: book,
    })
  }

  if (book.readaloud?.filepath) {
    out.push({
      folder: filepathFolder(book.readaloud.filepath),
      format: "readaloud",
      filepath: book.readaloud.filepath,
      existingBook: book,
    })
  }

  if (book.audiobook?.filepath) {
    out.push({
      folder: book.audiobook.filepath,
      format: "audiobook",
      filepath: book.audiobook.filepath,
      existingBook: book,
    })
  }

  return out
}

async function materializeCandidates(
  request: ScanRequest,
  ctx: ScanCtx,
): Promise<Candidate[]> {
  if (request.kind === "candidates") return request.candidates

  if (request.kind === "books") {
    const all: Candidate[] = []
    const books = await getBooks(request.bookUuids)
    for (const book of books) {
      if (ctx.signal.aborted) break
      all.push(...candidatesFromExistingBook(book))
    }
    return all
  }

  const books = await getBooks()
  if (ctx.signal.aborted) return []

  if (request.kind === "folders") {
    const all: Candidate[] = []
    for (const folder of request.folders) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (ctx.signal.aborted) break
      const candidates = await listBookCandidates(
        {
          folder,
          books,
          collections: request.collections,
          importMode: ctx.options.importMode,
          epub2ImportStrategy: ctx.options.epub2ImportStrategy,
        },
        ctx,
      )
      all.push(...candidates)
    }
    return all
  }

  // kind: "roots". this is a manual/scheduled scan
  const all: Candidate[] = []

  const canonicalRoots = await Promise.all(
    request.roots.map((r) => canonicalizePath(r.path)),
  )

  for (let i = 0; i < request.roots.length; i++) {
    const root = request.roots[i]
    const canonicalRoot = canonicalRoots[i]
    if (!root || !canonicalRoot) continue

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (ctx.signal.aborted) break

    const folders = await walkFolders({ root: canonicalRoot, books }, ctx)
    for (const folder of folders) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (ctx.signal.aborted) break
      const candidates = await listBookCandidates(
        {
          folder,
          books,
          collections: root.collections,
          warnIfFileAtRoot: true,
          importRoot: canonicalRoot,
          importMode: root.importMode,
          epub2ImportStrategy: root.epub2ImportStrategy,
        },
        ctx,
      )
      all.push(...candidates)
    }
  }

  // get all the other books (asset folders, manually imported)
  if (request.includeOrphanedBooks) {
    for (const book of books) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (ctx.signal.aborted) break

      const bookCandidates = candidatesFromExistingBook(book)
      // maybe don't rescan books? but its possible that book is both imported and referenced
      const orphaned = bookCandidates.filter(
        (c) => !canonicalRoots.some((root) => pathBelongsTo(root, c.filepath)),
      )

      all.push(...orphaned)
    }
  }

  return all
}

async function resolveDefaultImportMode(opts: {
  options?: ScanOptions
}): Promise<ImportMode> {
  if (opts.options?.importMode) return opts.options.importMode
  return await getSetting("importMode")
}

export async function scan(opts: {
  source: ScanSource
  request: ScanRequest
  options?: ScanOptions
  signal: AbortSignal
}): Promise<ScanResult> {
  const startedAt = Date.now()
  const report = new ScanReport(
    logger.child({ ctx: `[SCAN:${opts.source}]` }),
    startedAt,
    opts.source,
  )
  report.setTasks([opts.request.kind])
  report.logger.info(`Scan started (request kind: ${opts.request.kind})`)

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

  const defaultImportMode = await resolveDefaultImportMode({
    options: opts.options,
  })

  const baseOptions: ScanOptions = {
    concurrency: defaultConcurrency(opts.source),
    ...(opts.options ?? {}),
  }

  const locked = await withScanLock(
    opts.source,
    startedAt,
    scanController,
    async (setProgress) => {
      if (scanController.signal.aborted) {
        return { scannedBookUuids: new Set<UUID>(), processedCandidates: 0 }
      }

      const ctx: ScanCtx = {
        signal: scanController.signal,
        report,
        logger: report.logger,
        source: opts.source,
        options: baseOptions,
        defaultImportMode,
        setProgress,
      }

      const allCandidates = await materializeCandidates(opts.request, ctx)
      if (ctx.signal.aborted || !allCandidates.length) {
        return { scannedBookUuids: new Set<UUID>(), processedCandidates: 0 }
      }

      const candidates = dedupeCandidates(allCandidates)
      report.setInputsTotal(candidates.length)

      const scannedBookUuids = new Set<UUID>()
      const concurrency =
        baseOptions.concurrency ?? defaultConcurrency(opts.source)
      await runWorkers(candidates, ctx, concurrency, scannedBookUuids)

      return { scannedBookUuids, processedCandidates: candidates.length }
    },
  )

  report.finish()
  report.logger.info({ msg: report.formatSummary() })
  pushRecentReport(report)

  return {
    scannedBookUuids: locked?.scannedBookUuids ?? new Set<UUID>(),
    processedCandidates: locked?.processedCandidates ?? 0,
    report,
  }
}

export async function scanLibrary(opts: {
  source: ScanSource
  options?: ScanOptions
  signal: AbortSignal
}): Promise<ScanResult> {
  const watchRules = await getWatchRules()
  const roots = watchRules.map((rule) => ({
    path: rule.path,
    collections: rule.collections.map((c) => c.uuid),
    importMode: rule.importMode ?? undefined,
    epub2ImportStrategy: rule.epub2ImportStrategy ?? undefined,
  }))

  return scan({
    source: opts.source,
    request: { kind: "roots", roots, includeOrphanedBooks: true },
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
    request: { kind: "books", bookUuids: opts.bookUuids },
    options: opts.options ?? {},
    signal: opts.signal,
  })
}

async function runWorkers(
  candidates: Candidate[],
  ctx: ScanCtx,
  concurrency: number,
  scannedBookUuids: Set<UUID>,
) {
  const total = candidates.length
  if (total === 0) {
    ctx.setProgress(0, 0)
    return
  }

  ctx.setProgress(0, total)
  ctx.logger.debug(
    `Scanning ${total} candidate(s) with concurrency ${concurrency}`,
  )

  // group the candidates into a bucket by folder
  // to ensure that candidates from the same folder are processed together
  // by the same worker thread
  // EVERYTHING NEEDS TO BE GROUPED BY FOLDER
  const queue: Candidate[][] = []
  const folderBuckets = new Map<string, Candidate[]>()
  for (const candidate of candidates) {
    const bucket = folderBuckets.get(candidate.folder)
    if (bucket) {
      bucket.push(candidate)
    } else {
      const fresh = [candidate]
      folderBuckets.set(candidate.folder, fresh)
      queue.push(fresh)
    }
  }

  const workers = Math.max(1, Math.min(concurrency, queue.length))
  let next = 0
  let processed = 0

  const runOne = async (
    candidate: Candidate,
    index: number,
  ): Promise<BookWithRelations | null> => {
    ctx.logger.debug(
      `Scanning ${candidate.filepath} (${candidate.format}) [${index + 1}/${total}]`,
    )
    const memBefore = snapshot()

    await using scope = new AsyncDisposableStack()
    const pipelineCtx: PipelineCtx = { ...ctx, scope }
    try {
      const ingested = await ingestCandidate(candidate, pipelineCtx)
      if (!ingested) {
        reportDelta(`${candidate.format} ${candidate.filepath}`, memBefore)
        return null
      }
      const book =
        ingested.format === "audiobook"
          ? await scanAudiobook(ingested, pipelineCtx)
          : await scanEbook(ingested, pipelineCtx)
      if (book) {
        scannedBookUuids.add(book.uuid)
      }
      reportDelta(`${candidate.format} ${candidate.filepath}`, memBefore)
      return book
    } catch (err) {
      if (err instanceof ScanAbortedError) {
        ctx.logger.debug(
          `Scan aborted for ${candidate.filepath} (${candidate.format})`,
        )
        throw err
      }
      ctx.report.warn({
        step: "scan",
        msg: `Unhandled error scanning ${candidate.filepath} (${candidate.format})`,
        err,
      })
      return null
    }
  }

  const worker = async () => {
    while (!ctx.signal.aborted) {
      const index = next++
      if (index >= queue.length) return
      const group = queue[index]
      if (!group) return

      for (let i = 0; i < group.length; i++) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (ctx.signal.aborted) return
        const candidate = group[i]
        if (!candidate) continue

        let resultBook: BookWithRelations | null = null
        try {
          resultBook = await runOne(candidate, processed)
        } catch (err) {
          if (err instanceof ScanAbortedError) return
          throw err
        }

        if (resultBook) {
          for (let j = i + 1; j < group.length; j++) {
            const sibling = group[j]
            if (!sibling) continue
            if (sibling.existingBook || sibling.bookUuidHint) continue
            sibling.existingBook = resultBook
          }
        }

        processed += 1
        ctx.setProgress(processed, total)
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()))
}
