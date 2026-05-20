import { type BookWithRelations, getBook, getBooks } from "@/database/books"
import { getWatchRules } from "@/database/importRules"
import { getSetting } from "@/database/settings"
import { type ImportMode } from "@/database/settingsTypes"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

import { type ScanCtx, type ScanOptions, type ScanSource } from "./ctx"
import { canonicalizePath, listBookCandidates, walkFolders } from "./folder"
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
      roots: { path: string; collections?: UUID[]; importMode?: ImportMode }[]
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

async function candidatesFromExistingBook(
  bookUuid: UUID,
): Promise<Candidate[]> {
  const book = await getBook(bookUuid)
  if (!book) return []
  const out: Candidate[] = []
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

function filepathFolder(filepath: string): string {
  return filepath.replace(/\/[^/]+$/, "")
}

async function materializeCandidates(
  request: ScanRequest,
  ctx: ScanCtx,
): Promise<Candidate[]> {
  if (request.kind === "candidates") return request.candidates

  if (request.kind === "books") {
    const all: Candidate[] = []
    for (const bookUuid of request.bookUuids) {
      if (ctx.signal.aborted) break
      all.push(...(await candidatesFromExistingBook(bookUuid)))
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
        },
        ctx,
      )
      all.push(...candidates)
    }
    return all
  }

  // kind: "roots"
  const all: Candidate[] = []
  for (const root of request.roots) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (ctx.signal.aborted) break
    const canonicalRoot = await canonicalizePath(root.path)
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
        },
        ctx,
      )
      all.push(...candidates)
    }
  }
  return all
}

async function resolveImportMode(opts: {
  options?: ScanOptions
  request: ScanRequest
}): Promise<ImportMode> {
  if (opts.options?.importMode) return opts.options.importMode
  if (opts.request.kind === "roots") {
    // if any root specifies a mode, use the first; otherwise fall back.
    const explicit = opts.request.roots.find((r) => r.importMode)?.importMode
    if (explicit) return explicit
  }
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

  const importMode = await resolveImportMode({
    options: opts.options,
    request: opts.request,
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
        importMode,
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
    importMode: (rule.importMode as ImportMode | null) ?? undefined,
  }))

  return scan({
    source: opts.source,
    request: { kind: "roots", roots },
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

  // Groupable candidates from the same folder are serialized in one queue
  // entry so the first to land creates the book and the rest attach to it
  // via the `existingBook` hint we propagate below. Non-groupable
  // candidates (manual import, upload, scanBooks) each get their own entry
  // and run in parallel — they're independent units of work.
  const queue: Candidate[][] = []
  const folderBuckets = new Map<string, Candidate[]>()
  for (const candidate of candidates) {
    if (!candidate.groupable) {
      queue.push([candidate])
      continue
    }
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
    try {
      const book =
        candidate.format === "audiobook"
          ? await scanAudiobook(candidate, ctx)
          : await scanEbook(candidate, ctx)
      if (book) {
        scannedBookUuids.add(book.uuid)
      } else if (candidate.existingBook) {
        scannedBookUuids.add(candidate.existingBook.uuid)
      } else if (candidate.bookUuidHint) {
        scannedBookUuids.add(candidate.bookUuidHint)
      }
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
