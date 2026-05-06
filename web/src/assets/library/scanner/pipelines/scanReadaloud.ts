import { type ScanCtx } from "@/assets/library/scanner/ctx"
import { checkExistsStep } from "@/assets/library/scanner/steps/check-exists"
import { computeHashStep } from "@/assets/library/scanner/steps/compute-hash"
import { extractTextCoverStep } from "@/assets/library/scanner/steps/extract-covers"
import { extractReadaloudManifestStep } from "@/assets/library/scanner/steps/extract-manifest"
import { extractEpubMetadataStep } from "@/assets/library/scanner/steps/extract-metadata"
import { openEpubStep } from "@/assets/library/scanner/steps/open-epub"
import { reconcileMetadataStep } from "@/assets/library/scanner/steps/reconcile-metadata"
import { upgradeEpubStep } from "@/assets/library/scanner/steps/upgrade-epub"
import {
  EpubHashed,
  type FormatKnown,
  type ReadaloudInput,
} from "@/assets/library/scanner/types"

export async function scanReadaloud(input: ReadaloudInput, ctx: ScanCtx) {
  await using scope = new AsyncDisposableStack()
  const pipelineCtx: ScanCtx = { ...ctx, scope }

  const existing = await checkExistsStep.run(input, pipelineCtx)

  const hashed = await computeHashStep.run(existing, pipelineCtx)

  if (!hashed.changed) {
    if (hashed.format === "epub-unknown") {
      ctx.report.warn({
        step: "open-epub",
        msg: "Unknown EPUB did not change, skipping format determination",
        bookUuid: input.bookUuid,
      })
      return
    }

    ctx.report.skipped({
      step: "open-epub",
      bookUuid: input.bookUuid,
      format: input.format,
      reason: "unchanged",
    })
    return
  }

  const opened = await openEpubStep.run(hashed as EpubHashed, pipelineCtx)

  const upgraded = await upgradeEpubStep.run(opened, pipelineCtx)

  const reconciled = await readaloudTail(upgraded, pipelineCtx)
  if (!reconciled) return

  await extractTextCoverStep.run(reconciled, pipelineCtx)
  ctx.report.succeeded({
    step: "scan-readaloud",
    bookUuid: reconciled.bookUuid,
    format: "readaloud",
  })
}

export async function readaloudTail<
  T extends FormatKnown & { format: "readaloud" },
>(input: T, ctx: ScanCtx) {
  const metadata = await extractEpubMetadataStep.run(input, ctx)
  if (!metadata) return null

  const manifest = await extractReadaloudManifestStep.run(metadata, ctx)
  if (!manifest) return null

  return await reconcileMetadataStep.run(manifest, ctx)
}
