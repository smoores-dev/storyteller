import { type ScanCtx } from "@/assets/library/scanner/ctx"
import { checkExistsStep } from "@/assets/library/scanner/steps/check-exists"
import { checkFingerprintStep } from "@/assets/library/scanner/steps/check-fingerprint"
import { computeHashStep } from "@/assets/library/scanner/steps/compute-hash"
import { extractTextCoverStep } from "@/assets/library/scanner/steps/extract-covers"
import {
  extractEbookManifestStep,
  extractReadaloudManifestStep,
} from "@/assets/library/scanner/steps/extract-manifest"
import { extractEpubMetadataStep } from "@/assets/library/scanner/steps/extract-metadata"
import { openEpubStep } from "@/assets/library/scanner/steps/open-epub"
import { reconcileMetadataStep } from "@/assets/library/scanner/steps/reconcile-metadata"
import { upgradeEpubStep } from "@/assets/library/scanner/steps/upgrade-epub"
import {
  type EbookInput,
  type EpubHashed,
  type ReadaloudInput,
} from "@/assets/library/scanner/types"

export async function scanEbook(
  input: EbookInput | ReadaloudInput,
  ctx: ScanCtx,
) {
  await using scope = new AsyncDisposableStack()
  const pipelineCtx: ScanCtx = { ...ctx, scope }

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

  const hashed = await computeHashStep(fingerprinted, pipelineCtx)

  const opened = await openEpubStep(hashed as EpubHashed, pipelineCtx)

  const upgraded = opened.isEpub2
    ? await upgradeEpubStep(opened, pipelineCtx)
    : opened

  if (!upgraded) {
    // maybe do something
    return
  }

  const metadata = await extractEpubMetadataStep(upgraded, ctx)

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
    format: "ebook",
  })
}
