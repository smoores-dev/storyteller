import { type PipelineCtx } from "@/assets/library/scanner/ctx"
import { type IngestedAudiobook } from "@/assets/library/scanner/ingest"
import { checkExistsStep } from "@/assets/library/scanner/steps/check-exists"
import { checkFingerprintStep } from "@/assets/library/scanner/steps/check-fingerprint"
import { extractAudiobookCoverStep } from "@/assets/library/scanner/steps/extract-covers"
import { extractAudiobookManifestStep } from "@/assets/library/scanner/steps/extract-manifest"
import { extractAudiobookMetadataStep } from "@/assets/library/scanner/steps/extract-metadata"
import { openAudiobookStep } from "@/assets/library/scanner/steps/open"
import { reconcileMetadataStep } from "@/assets/library/scanner/steps/update-book"
import { type AudiobookInput } from "@/assets/library/scanner/types"
import { type BookWithRelations } from "@/database/books"

export async function scanAudiobook(
  ingested: IngestedAudiobook,
  ctx: PipelineCtx,
): Promise<BookWithRelations | null> {
  const { book, filepath, isNew, preopenedAudiobook } = ingested

  const input = {
    bookUuid: book.uuid,
    filepath,
    book,
    isNew,
    missing: book.audiobook?.missing ?? false,
    existingFingerprint: book.audiobook?.fingerprint ?? null,
    format: "audiobook",
  } as const satisfies AudiobookInput

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

  const opened = preopenedAudiobook
    ? { ...fingerprinted, audiobook: preopenedAudiobook }
    : await openAudiobookStep(fingerprinted, ctx)
  if (!opened) return book

  const metadata = await extractAudiobookMetadataStep(opened, ctx)

  // cover extraction runs before the metadata commit, see scanEbook.ts.
  const cover = await extractAudiobookCoverStep(metadata, ctx)

  const manifest = await extractAudiobookManifestStep(cover, ctx)

  const reconciled = await reconcileMetadataStep(manifest, ctx)

  if (!reconciled) return book

  ctx.report.succeeded({
    step: "scan-audiobook",
    book: reconciled.book,
    format: "audiobook",
  })
  return reconciled.book
}
