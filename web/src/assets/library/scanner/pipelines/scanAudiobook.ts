import { type ScanCtx } from "@/assets/library/scanner/ctx"
import { checkExistsStep } from "@/assets/library/scanner/steps/check-exists"
import { computeHashStep } from "@/assets/library/scanner/steps/compute-hash"
import { extractAudiobookCoverStep } from "@/assets/library/scanner/steps/extract-covers"
import { extractAudiobookManifestStep } from "@/assets/library/scanner/steps/extract-manifest"
import { extractAudiobookMetadataStep } from "@/assets/library/scanner/steps/extract-metadata"
import { openAudiobookStep } from "@/assets/library/scanner/steps/open-audiobook"
import { reconcileMetadataStep } from "@/assets/library/scanner/steps/reconcile-metadata"
import {
  type AudiobookHashed,
  type AudiobookInput,
} from "@/assets/library/scanner/types"

export async function scanAudiobook(input: AudiobookInput, ctx: ScanCtx) {
  await using scope = new AsyncDisposableStack()
  const pipelineCtx: ScanCtx = { ...ctx, scope }

  const existing = await checkExistsStep.run(input, pipelineCtx)

  const hashed = await computeHashStep.run(existing, pipelineCtx)

  if (!hashed.changed) {
    ctx.report.skipped({
      step: "open-audiobook",
      bookUuid: input.bookUuid,
      format: input.format,
      reason: "unchanged",
    })
    return
  }

  const opened = await openAudiobookStep.run(
    hashed as AudiobookHashed,
    pipelineCtx,
  )

  const metadata = await extractAudiobookMetadataStep.run(opened, pipelineCtx)

  const manifest = await extractAudiobookManifestStep.run(metadata, pipelineCtx)

  const reconciled = await reconcileMetadataStep.run(manifest, pipelineCtx)

  await extractAudiobookCoverStep.run(reconciled, pipelineCtx)
  ctx.report.succeeded({
    step: "scan-audiobook",
    bookUuid: reconciled.bookUuid,
    format: "audiobook",
  })
}
