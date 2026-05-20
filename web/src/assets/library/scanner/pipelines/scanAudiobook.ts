import {
  createBookFromOpenedAudiobook,
  ensureCollections,
  openAudiobookDir,
} from "@/assets/library/scanner/create-book"
import { type ScanCtx } from "@/assets/library/scanner/ctx"
import { findExistingBook } from "@/assets/library/scanner/find-book"
import { relocateIfNeeded } from "@/assets/library/scanner/relocate"
import { checkExistsStep } from "@/assets/library/scanner/steps/check-exists"
import { checkFingerprintStep } from "@/assets/library/scanner/steps/check-fingerprint"
import { extractAudiobookCoverStep } from "@/assets/library/scanner/steps/extract-covers"
import { extractAudiobookManifestStep } from "@/assets/library/scanner/steps/extract-manifest"
import { extractAudiobookMetadataStep } from "@/assets/library/scanner/steps/extract-metadata"
import { openAudiobookStep } from "@/assets/library/scanner/steps/open"
import { reconcileMetadataStep } from "@/assets/library/scanner/steps/reconcile-metadata"
import {
  type AudiobookInput,
  type Candidate,
} from "@/assets/library/scanner/types"
import { type BookWithRelations } from "@/database/books"

export async function scanAudiobook(
  candidate: Candidate,
  ctx: ScanCtx,
): Promise<BookWithRelations | null> {
  await using scope = new AsyncDisposableStack()
  const pipelineCtx: ScanCtx = { ...ctx, scope }

  let book = await findExistingBook(candidate)
  let filepath = candidate.filepath
  let isNew: boolean

  if (book) {
    await ensureCollections(book, candidate.collections)
    isNew = false
  } else {
    const opened = await openAudiobookDir(candidate, pipelineCtx)
    if (!opened) return null

    const created = await createBookFromOpenedAudiobook(
      candidate,
      opened,
      pipelineCtx,
    )
    if (!created) return null

    const relocated = await relocateIfNeeded(
      created,
      candidate.filepath,
      "audiobook",
      pipelineCtx,
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

  const existing = await checkExistsStep(input, pipelineCtx)
  if (!existing) return book

  const fingerprinted = await checkFingerprintStep(existing, pipelineCtx)

  if (!fingerprinted.changed) {
    ctx.report.skipped({
      step: "check-fingerprint",
      book: input.book,
      format: input.format,
      reason: "unchanged",
    })
    return book
  }

  const opened = await openAudiobookStep(fingerprinted, pipelineCtx)
  if (!opened) return book

  const metadata = await extractAudiobookMetadataStep(opened, pipelineCtx)

  const manifest = await extractAudiobookManifestStep(metadata, pipelineCtx)

  const reconciled = await reconcileMetadataStep(manifest, pipelineCtx)

  if (!reconciled) return book

  await extractAudiobookCoverStep(reconciled, pipelineCtx)
  ctx.report.succeeded({
    step: "scan-audiobook",
    book: reconciled.book,
    format: "audiobook",
  })
  return reconciled.book
}
