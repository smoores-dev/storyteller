import { reserveBookDirectory } from "@/assets/fs"
import {
  createBookFromOpenedAudiobook,
  ensureCollections,
  openAudiobookDir,
} from "@/assets/library/scanner/create-book"
import { type PipelineCtx } from "@/assets/library/scanner/ctx"
import { findExistingBook } from "@/assets/library/scanner/find-book"
import { relocateIfNeeded } from "@/assets/library/scanner/relocate"
import { checkExistsStep } from "@/assets/library/scanner/steps/check-exists"
import { checkFingerprintStep } from "@/assets/library/scanner/steps/check-fingerprint"
import { extractAudiobookCoverStep } from "@/assets/library/scanner/steps/extract-covers"
import { extractAudiobookManifestStep } from "@/assets/library/scanner/steps/extract-manifest"
import { extractAudiobookMetadataStep } from "@/assets/library/scanner/steps/extract-metadata"
import { openAudiobookStep } from "@/assets/library/scanner/steps/open"
import { reconcileMetadataStep } from "@/assets/library/scanner/steps/update-book"
import {
  type AudiobookInput,
  type Candidate,
} from "@/assets/library/scanner/types"
import { type BookWithRelations } from "@/database/books"

export async function scanAudiobook(
  candidate: Candidate,
  ctx: PipelineCtx,
): Promise<BookWithRelations | null> {
  let book = await findExistingBook(candidate)
  let filepath = candidate.filepath
  let isNew: boolean

  if (book) {
    await ensureCollections(book, candidate.collections)
    isNew = false
  } else {
    const opened = await openAudiobookDir(candidate, ctx)
    if (!opened) return null

    const created = await createBookFromOpenedAudiobook(candidate, opened, ctx)
    if (!created) return null

    // see scanEbook.ts: reserve before any pipeline step writes into it.
    const reserved = await reserveBookDirectory(created)

    const relocated = await relocateIfNeeded(
      reserved,
      candidate.filepath,
      "audiobook",
      candidate.importMode ?? ctx.defaultImportMode,
    )
    book = relocated.book
    filepath = relocated.filepath
    isNew = true
  }

  const input = {
    bookUuid: book.uuid,
    filepath,
    book,
    isNew,
    missing: book.audiobook?.missing ?? false,
    existingFingerprint: book.audiobook?.fingerprint ?? null,
    format: "audiobook",
  } as const satisfies AudiobookInput

  // ==== pipeline starts here ====

  const existing = await checkExistsStep(input, ctx)
  if (!existing) return book

  const fingerprinted = await checkFingerprintStep(existing, ctx)

  if (!fingerprinted.changed) {
    ctx.report.skipped({
      step: "check-fingerprint",
      book: input.book,
      format: input.format,
      reason: "unchanged",
    })
    return book
  }

  const opened = await openAudiobookStep(fingerprinted, ctx)
  if (!opened) return book

  const metadata = await extractAudiobookMetadataStep(opened, ctx)

  // cover extraction runs before the metadata commit, see scanEbook.ts.
  await extractAudiobookCoverStep(metadata, ctx)

  const manifest = await extractAudiobookManifestStep(metadata, ctx)

  const reconciled = await reconcileMetadataStep(manifest, ctx)

  if (!reconciled) return book

  ctx.report.succeeded({
    step: "scan-audiobook",
    book: reconciled.book,
    format: "audiobook",
  })
  return reconciled.book
}
