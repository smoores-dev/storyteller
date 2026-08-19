import { type PipelineCtx } from "@/assets/library/scanner/ctx"
import { type IngestedEpub } from "@/assets/library/scanner/ingest"
import { checkExistsStep } from "@/assets/library/scanner/steps/check-exists"
import { checkFingerprintStep } from "@/assets/library/scanner/steps/check-fingerprint"
import { extractTextCoverStep } from "@/assets/library/scanner/steps/extract-covers"
import {
  extractEbookManifestStep,
  extractReadaloudManifestStep,
} from "@/assets/library/scanner/steps/extract-manifest"
import { extractEpubMetadataStep } from "@/assets/library/scanner/steps/extract-metadata"
import { openEpubStep } from "@/assets/library/scanner/steps/open"
import { reconcileMetadataStep } from "@/assets/library/scanner/steps/update-book"
import {
  type EbookInput,
  type ReadaloudInput,
} from "@/assets/library/scanner/types"
import { type BookWithRelations } from "@/database/books"

export async function scanEbook(
  ingested: IngestedEpub,
  ctx: PipelineCtx,
): Promise<BookWithRelations | null> {
  const { book, filepath, format, isNew, preopenedEpub } = ingested

  const input = {
    bookUuid: book.uuid,
    filepath,
    book,
    isNew,
    missing: book[format]?.missing ?? false,
    existingFingerprint: book[format]?.fingerprint ?? null,
    format,
  } as const satisfies EbookInput | ReadaloudInput

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

  const opened = preopenedEpub
    ? { ...fingerprinted, isEpub2: false as const, epub: preopenedEpub }
    : await openEpubStep(fingerprinted, ctx)

  const metadata = await extractEpubMetadataStep(opened, ctx)

  // cover extraction runs before the metadata commit. if it fails, no DB
  // update happens so the next scan retries the whole pipeline. running it
  // after reconcile would leave the DB updated but the cover missing, and
  // the next fingerprint check would skip the retry.
  const cover = await extractTextCoverStep(metadata, ctx)

  const manifest =
    cover.format === "readaloud"
      ? await extractReadaloudManifestStep(cover, ctx)
      : await extractEbookManifestStep(cover, ctx)

  const reconciled = await reconcileMetadataStep(manifest, ctx)
  if (!reconciled) return book

  ctx.report.succeeded({
    step: "scan-ebook",
    book: reconciled.book,
    format: reconciled.format,
  })
  return reconciled.book
}
