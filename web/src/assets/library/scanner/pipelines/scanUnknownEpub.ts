import { type ScanCtx } from "@/assets/library/scanner/ctx"
import { ebookTail } from "@/assets/library/scanner/pipelines/scanEbook"
import { readaloudTail } from "@/assets/library/scanner/pipelines/scanReadaloud"
import { checkExistsStep } from "@/assets/library/scanner/steps/check-exists"
import { computeHashStep } from "@/assets/library/scanner/steps/compute-hash"
import { determineFormatStep } from "@/assets/library/scanner/steps/determine-format"
import { extractTextCoverStep } from "@/assets/library/scanner/steps/extract-covers"
import { openEpubStep } from "@/assets/library/scanner/steps/open-epub"
import { upgradeEpubStep } from "@/assets/library/scanner/steps/upgrade-epub"
import {
  type EpubHashed,
  type UnknownEpubInput,
} from "@/assets/library/scanner/types"

export async function scanUnknownEpub(input: UnknownEpubInput, ctx: ScanCtx) {
  await using scope = new AsyncDisposableStack()
  const pipelineCtx: ScanCtx = { ...ctx, scope }

  const existing = await checkExistsStep.run(input, pipelineCtx)

  const hashed = await computeHashStep.run(existing, pipelineCtx)

  const opened = await openEpubStep.run(hashed as EpubHashed, pipelineCtx)

  const upgraded = await upgradeEpubStep.run(opened, pipelineCtx)

  const classified = await determineFormatStep.run(upgraded, pipelineCtx)

  const reconciled =
    classified.format === "ebook"
      ? await ebookTail(classified, pipelineCtx)
      : await readaloudTail(classified, pipelineCtx)

  await extractTextCoverStep.run(reconciled, pipelineCtx)
  ctx.report.succeeded({
    step: "scan-unknown-epub",
    bookUuid: reconciled.bookUuid,
    format: reconciled.format,
  })
}
