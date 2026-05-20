import {
  createBookFromOpenedEpub,
  ensureCollections,
  openAndClassifyEpub,
} from "@/assets/library/scanner/create-book"
import { type ScanCtx } from "@/assets/library/scanner/ctx"
import { findExistingBook } from "@/assets/library/scanner/find-book"
import { relocateIfNeeded } from "@/assets/library/scanner/relocate"
import { checkExistsStep } from "@/assets/library/scanner/steps/check-exists"
import { checkFingerprintStep } from "@/assets/library/scanner/steps/check-fingerprint"
import { extractTextCoverStep } from "@/assets/library/scanner/steps/extract-covers"
import {
  extractEbookManifestStep,
  extractReadaloudManifestStep,
} from "@/assets/library/scanner/steps/extract-manifest"
import { extractEpubMetadataStep } from "@/assets/library/scanner/steps/extract-metadata"
import { openEpubStep } from "@/assets/library/scanner/steps/open"
import { reconcileMetadataStep } from "@/assets/library/scanner/steps/reconcile-metadata"
import {
  type Candidate,
  type EbookInput,
  type ReadaloudInput,
} from "@/assets/library/scanner/types"
import { type BookWithRelations } from "@/database/books"

type EpubFormat = Extract<
  EbookInput["format"] | ReadaloudInput["format"],
  string
>

/* sort of a failsafe incase we have already classified a readaloud as an ebook or some reason */
function classifyExistingBook(
  book: BookWithRelations,
  candidate: Candidate,
): EpubFormat {
  if (book.ebook?.filepath === candidate.filepath) return "ebook"
  if (book.readaloud?.filepath === candidate.filepath) return "readaloud"
  return candidate.format === "audiobook" ? "ebook" : candidate.format
}

export async function scanEbook(
  candidate: Candidate,
  ctx: ScanCtx,
): Promise<BookWithRelations | null> {
  await using scope = new AsyncDisposableStack()
  const pipelineCtx: ScanCtx = { ...ctx, scope }

  let book = await findExistingBook(candidate)
  let filepath = candidate.filepath
  let format: EpubFormat
  let isNew: boolean

  if (book) {
    await ensureCollections(book, candidate.collections)
    format = classifyExistingBook(book, candidate)
    isNew = false
  } else {
    const opened = await openAndClassifyEpub(candidate, pipelineCtx)
    if (!opened) return null

    const created = await createBookFromOpenedEpub(
      candidate,
      opened,
      pipelineCtx,
    )
    if (!created) return null

    const relocated = await relocateIfNeeded(
      created,
      candidate.filepath,
      opened.format,
      pipelineCtx,
    )
    book = relocated.book
    filepath = relocated.filepath
    format = opened.format
    isNew = true
  }

  // ==== pipeline starts here ====
  const input = {
    bookUuid: book.uuid,
    filepath,
    book,
    isNew,
    missing: book[format]?.missing ?? false,
    existingFingerprint: book[format]?.fingerprint ?? null,
    format,
  } as const satisfies EbookInput | ReadaloudInput

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

  const opened = await openEpubStep(fingerprinted, pipelineCtx)

  const metadata = await extractEpubMetadataStep(opened, ctx)

  const manifest =
    metadata.format === "readaloud"
      ? await extractReadaloudManifestStep(metadata, ctx)
      : await extractEbookManifestStep(metadata, ctx)

  const reconciled = await reconcileMetadataStep(manifest, ctx)
  if (!reconciled) return book

  await extractTextCoverStep(reconciled, pipelineCtx)
  ctx.report.succeeded({
    step: "scan-ebook",
    book: reconciled.book,
    format: reconciled.format,
  })
  return reconciled.book
}
