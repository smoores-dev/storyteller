import { type ScanCtx } from "@/assets/library/scanner/ctx"
import { checkExistsStep } from "@/assets/library/scanner/steps/check-exists"
import { checkFingerprintStep } from "@/assets/library/scanner/steps/check-fingerprint"
import { extractAudiobookCoverStep } from "@/assets/library/scanner/steps/extract-covers"
import { extractAudiobookManifestStep } from "@/assets/library/scanner/steps/extract-manifest"
import { extractAudiobookMetadataStep } from "@/assets/library/scanner/steps/extract-metadata"
import { openAudiobookStep } from "@/assets/library/scanner/steps/open-audiobook"
import { reconcileMetadataStep } from "@/assets/library/scanner/steps/reconcile-metadata"
import { type AudiobookInput } from "@/assets/library/scanner/types"

export async function scanAudiobook(input: AudiobookInput, ctx: ScanCtx) {
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

  const opened = await openAudiobookStep(fingerprinted, pipelineCtx)
  if (!opened) {
    // maybe do something
    return
  }

  const metadata = await extractAudiobookMetadataStep(opened, pipelineCtx)

  const manifest = await extractAudiobookManifestStep(metadata, pipelineCtx)

  const reconciled = await reconcileMetadataStep(manifest, pipelineCtx)

  if (!reconciled) {
    // maybe do something
    return
  }

  await extractAudiobookCoverStep(reconciled, pipelineCtx)
  ctx.report.succeeded({
    step: "scan-audiobook",
    book: reconciled.book,
    format: "audiobook",
  })
}
