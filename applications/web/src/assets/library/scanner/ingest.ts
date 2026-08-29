import { randomUUID } from "node:crypto"
import { rm } from "node:fs/promises"

import { type Audiobook } from "@storyteller-platform/audiobook"
import { type InMemoryEpubReader } from "@storyteller-platform/epub"
import { scratchPath } from "@storyteller-platform/fs"

import { reserveBookDirectory } from "@/assets/fs"
import {
  type OpenEpubOpts,
  createBookFromOpenedAudiobook,
  createBookFromOpenedEpub,
  ensureCollections,
  isReadaloudEpub,
  openAudiobookDir,
  openOrUpgradeEpub,
} from "@/assets/library/scanner/create-book"
import { type PipelineCtx } from "@/assets/library/scanner/ctx"
import {
  findExistingBook,
  isOrphanInAssetsDir,
} from "@/assets/library/scanner/find-book"
import { relocateIfNeeded } from "@/assets/library/scanner/relocate"
import { type Candidate, type ScanFormat } from "@/assets/library/scanner/types"
import { type BookWithRelations, updateBook } from "@/database/books"
import { type ImportMode } from "@/database/settingsTypes"

/**
 * format-agnostic resolved candidate ready to feed into the pipeline. the
 * pipeline gets a fully-placed file (relocated if needed), a settled book row,
 * and optionally a pre-opened asset handle to skip re-opening the same file.
 */
type IngestedBase = {
  book: BookWithRelations
  filepath: string
  isNew: boolean
}

export type IngestedEpub = IngestedBase & {
  format: "ebook" | "readaloud"
  // null when ingest didn't open the file (existing-book branch); scanEbook
  // then calls openEpubStep, which upgrades EPUB 2 if needed.
  preopenedEpub: InMemoryEpubReader | null
}

export type IngestedAudiobook = IngestedBase & {
  format: "audiobook"
  preopenedAudiobook: Audiobook | null
}

export type IngestResult = IngestedEpub | IngestedAudiobook

function pathForFormat(
  book: BookWithRelations,
  format: ScanFormat,
): string | null {
  switch (format) {
    case "ebook":
      return book.ebook?.filepath ?? null
    case "readaloud":
      return book.readaloud?.filepath ?? null
    case "audiobook":
      return book.audiobook?.filepath ?? null
  }
}

/**
 * failsafe: an existing book's stored filepaths win over what the candidate
 * claims the format is. e.g. if a file at /foo.epub is registered as
 * book.readaloud.filepath but the candidate says format: "ebook", we treat it
 * as readaloud. defaults to candidate.format when nothing matches.
 */
function classifyExistingFormat(
  book: BookWithRelations,
  candidate: Candidate,
): ScanFormat {
  if (candidate.format === "audiobook") return "audiobook"
  if (book.ebook?.filepath === candidate.filepath) return "ebook"
  if (book.readaloud?.filepath === candidate.filepath) return "readaloud"
  return candidate.format
}

/**
 * place an incoming file for an existing book. `reference` mode just rewrites
 * the book's filepath to the source. non-reference modes delegate to
 * relocateIfNeeded which moves/copies/hardlinks into the asset dir and updates
 * the book row.
 */
async function placeForExistingBook(
  book: BookWithRelations,
  srcFilepath: string,
  format: ScanFormat,
  importMode: ImportMode,
): Promise<{ book: BookWithRelations; filepath: string }> {
  if (importMode === "reference") {
    const updated = await updateBook(book.uuid, null, {
      [format]: {
        filepath: srcFilepath,
        missing: false,
        ...(format === "readaloud" && {
          status: book.readaloud?.status ?? "ALIGNED",
          currentStage: book.readaloud?.currentStage ?? "SPLIT_TRACKS",
        }),
      },
    })
    return { book: updated, filepath: srcFilepath }
  }
  return await relocateIfNeeded(book, srcFilepath, format, importMode)
}

/**
 * for copy mode, we write the upgraded epub3 to a writable tmp path, then copy it to the library.
 * this kind of breaks the nice step-by-step logic for ingestion but ehh
 */
function resolveEpubOpenOpts(importMode: ImportMode): OpenEpubOpts {
  if (importMode === "copy") {
    return {
      strategyOverride: "replace",
      upgradeTo: scratchPath(`storyteller-upgrade-${randomUUID()}.epub`),
    }
  }

  return {}
}

async function ingestNewEbook(
  candidate: Candidate,
  ctx: PipelineCtx,
  importMode: ImportMode,
): Promise<IngestedEpub | null> {
  const opts = resolveEpubOpenOpts(importMode)
  let openedEpub: InMemoryEpubReader | null = null
  let effectivePath: string | null = null

  ctx.scope.defer(async () => {
    // delete the upgrade tmp file if it exists
    if (opts.upgradeTo) {
      await rm(opts.upgradeTo, { force: true })
    }
  })

  try {
    const opened = await openOrUpgradeEpub(
      candidate.filepath,
      opts.strategyOverride ?? candidate.epub2ImportStrategy,
      opts.upgradeTo,
    )
    openedEpub = ctx.scope.use(opened.reader)
    effectivePath = opened.effectivePath
  } catch (error) {
    ctx.report.warn({
      step: "open-epub",
      msg: `Failed to open epub at ${candidate.filepath}; skipping`,
      err: error,
    })
    return null
  }

  const epubFormat = (await isReadaloudEpub(openedEpub)) ? "readaloud" : "ebook"

  const bookCandidate =
    !opts.upgradeTo && effectivePath !== candidate.filepath
      ? { ...candidate, filepath: effectivePath }
      : candidate

  const created = await createBookFromOpenedEpub(
    bookCandidate,
    openedEpub,
    epubFormat,
    ctx,
  )

  if (!created) return null

  // reserve a unique asset dir before any pipeline step (cover writes, text
  // extracts) can land in it. without this, two same-title books in reference
  // mode share the same asset folder bc they don't know about each other.
  const reserved = await reserveBookDirectory(created)

  const relocated = await relocateIfNeeded(
    reserved,
    effectivePath,
    epubFormat,
    importMode,
    // ignore the original on-disk epub, not effectivePath, which may be the
    // throwaway tmp epub3 upgrade in copy mode.
    candidate.filepath,
  )

  return {
    book: relocated.book,
    filepath: relocated.filepath,
    format: epubFormat,
    isNew: true,
    // unix rename/unlink keeps the fd valid against the original inode, so
    // the handle still reads correctly after relocateIfNeeded.
    preopenedEpub: openedEpub,
  }
}

async function ingestNewAudiobook(
  candidate: Candidate,
  ctx: PipelineCtx,
  importMode: ImportMode,
): Promise<IngestedAudiobook | null> {
  const opened = await openAudiobookDir(candidate, ctx)
  if (!opened) return null

  const created = await createBookFromOpenedAudiobook(candidate, opened, ctx)
  if (!created) return null

  // see ingestNewEbook
  const reserved = await reserveBookDirectory(created)

  const relocated = await relocateIfNeeded(
    reserved,
    candidate.filepath,
    "audiobook",
    importMode,
  )

  // if we're moving the audiobook, we shouldnt keep the ref to the original audiobook
  // will reopen during scan
  const preopenedAudiobook = importMode === "move" ? null : opened.audiobook

  return {
    book: relocated.book,
    filepath: relocated.filepath,
    format: "audiobook",
    isNew: true,
    preopenedAudiobook,
  }
}

/**
 * resolve a Candidate into a settled tuple the pipeline can consume. the
 * single boundary that handles new books, existing books at their stored
 * paths, and existing books at new paths (replace flow). also returns the
 * pre-opened handle when the new-book branch opened the file, so the pipeline
 * doesn't reopen the same zip.
 */
export async function ingestCandidate(
  candidate: Candidate,
  ctx: PipelineCtx,
): Promise<IngestResult | null> {
  const existing = await findExistingBook(candidate)

  if (existing) {
    await ensureCollections(existing, candidate.collections)

    const format = classifyExistingFormat(existing, candidate)
    const storedPath = pathForFormat(existing, format)
    const importMode = candidate.importMode ?? ctx.defaultImportMode

    if (storedPath !== candidate.filepath) {
      const placed = await placeForExistingBook(
        existing,
        candidate.filepath,
        format,
        importMode,
      )
      return assembleExisting(placed.book, placed.filepath, format)
    }

    return assembleExisting(existing, candidate.filepath, format)
  }

  if (isOrphanInAssetsDir(candidate, existing)) return null

  const importMode = candidate.importMode ?? ctx.defaultImportMode
  if (candidate.format === "audiobook") {
    return await ingestNewAudiobook(candidate, ctx, importMode)
  }
  return await ingestNewEbook(candidate, ctx, importMode)
}

function assembleExisting(
  book: BookWithRelations,
  filepath: string,
  format: ScanFormat,
): IngestResult {
  if (format === "audiobook") {
    return {
      book,
      filepath,
      format,
      isNew: false,
      preopenedAudiobook: null,
    }
  }
  return {
    book,
    filepath,
    format,
    isNew: false,
    preopenedEpub: null,
  }
}
