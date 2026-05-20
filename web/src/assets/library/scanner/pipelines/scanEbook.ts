import { type ScanCtx } from "@/assets/library/scanner/ctx"
import { checkExistsStep } from "@/assets/library/scanner/steps/check-exists"
import { checkFingerprintStep } from "@/assets/library/scanner/steps/check-fingerprint"
import {
  createBookFromOpenedEpub,
  ensureCollections,
  openAndClassifyEpub,
} from "@/assets/library/scanner/steps/create-book"
import { determineFormatStep } from "@/assets/library/scanner/steps/determine-format"
import { extractTextCoverStep } from "@/assets/library/scanner/steps/extract-covers"
import {
  extractEbookManifestStep,
  extractReadaloudManifestStep,
} from "@/assets/library/scanner/steps/extract-manifest"
import { extractEpubMetadataStep } from "@/assets/library/scanner/steps/extract-metadata"
import { findExistingBook } from "@/assets/library/scanner/steps/find-book"
import { openEpubStep } from "@/assets/library/scanner/steps/open-epub"
import { reconcileMetadataStep } from "@/assets/library/scanner/steps/reconcile-metadata"
import { relocateIfNeeded } from "@/assets/library/scanner/steps/relocate"
import { upgradeEpubStep } from "@/assets/library/scanner/steps/upgrade-epub"
import {
  type Candidate,
  type EbookInput,
  type EpubFingerprinted,
  type ReadaloudInput,
} from "@/assets/library/scanner/types"
import { type BookWithRelations } from "@/database/books"

type EpubFormat = Extract<
  EbookInput["format"] | ReadaloudInput["format"],
  string
>

function classifyExistingBook(
  book: BookWithRelations,
  candidate: Candidate,
): EpubFormat {
  // Honor the candidate's stated format, but if the existing book has the
  // exact filepath under one of its relations, trust that.
  if (book.ebook?.filepath === candidate.filepath) return "ebook"
  if (book.readaloud?.filepath === candidate.filepath) return "readaloud"
  return candidate.format === "audiobook" ? "ebook" : candidate.format
}

function buildEpubInput(
  book: BookWithRelations,
  filepath: string,
  format: EpubFormat,
  isNew: boolean,
): EbookInput | ReadaloudInput {
  const baseRelation = format === "ebook" ? book.ebook : book.readaloud
  const shared = {
    bookUuid: book.uuid,
    filepath,
    book,
    isNew,
    missing: baseRelation?.missing ?? false,
    existingFingerprint: baseRelation?.fingerprint ?? null,
  } as const
  return format === "ebook"
    ? { ...shared, format: "ebook" }
    : { ...shared, format: "readaloud" }
}

export async function scanEbook(candidate: Candidate, ctx: ScanCtx) {
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
    if (!opened) return

    const created = await createBookFromOpenedEpub(
      candidate,
      opened,
      pipelineCtx,
    )
    if (!created) return

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

  const input = buildEpubInput(book, filepath, format, isNew)

  const existing = await checkExistsStep(input, pipelineCtx)
  if (!existing) return

  const fingerprinted = await checkFingerprintStep(existing, pipelineCtx)

  if (!fingerprinted.changed) {
    ctx.report.skipped({
      step: "check-fingerprint",
      book: input.book,
      format: input.format,
      reason: "unchanged",
    })
    return
  }

  const opened = await openEpubStep(
    fingerprinted as EpubFingerprinted,
    pipelineCtx,
  )

  const upgraded = opened.isEpub2
    ? await upgradeEpubStep(opened, pipelineCtx)
    : opened

  if (!upgraded) return

  const formatKnown = await determineFormatStep(upgraded, pipelineCtx)

  const metadata = await extractEpubMetadataStep(formatKnown, ctx)

  const manifest =
    metadata.format === "readaloud"
      ? await extractReadaloudManifestStep(metadata, ctx)
      : await extractEbookManifestStep(metadata, ctx)

  const reconciled = await reconcileMetadataStep(manifest, ctx)
  if (!reconciled) return

  await extractTextCoverStep(reconciled, pipelineCtx)
  ctx.report.succeeded({
    step: "scan-ebook",
    book: reconciled.book,
    format: reconciled.format,
  })
}
