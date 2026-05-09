import { type ScanCtx } from "@/assets/library/scanner/ctx"
import { checkExistsStep } from "@/assets/library/scanner/steps/check-exists"
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
  type Hashed,
  type ReadaloudInput,
  type ScanInput,
} from "@/assets/library/scanner/types"

const isEpub2 = <T extends EpubHashed & { isEpub2: boolean }>(
  input: T,
): input is T & { isEpub2: true } => {
  return input.isEpub2
}

const isChanged = <Input extends Hashed>(
  input: Input,
): input is Input extends Input ? Input & { changed: true } : never => {
  return input.changed
}

const isReadaloud = <Input extends ScanInput>(
  input: Input,
): input is Input & { format: "readaloud" } => {
  return input.format === "readaloud"
}

export async function scanEbook(
  input: EbookInput | ReadaloudInput,
  ctx: ScanCtx,
) {
  await using scope = new AsyncDisposableStack()
  const pipelineCtx: ScanCtx = { ...ctx, scope }

  const existing = await checkExistsStep(input, pipelineCtx)
  if (!existing) return

  const hashed = await computeHashStep(existing, pipelineCtx)

  if (!isChanged(hashed)) {
    ctx.report.skipped({
      step: "open-epub",
      book: input.book,
      format: input.format,
      reason: "unchanged",
    })
    return
  }

  const opened = await openEpubStep(hashed as EpubHashed, pipelineCtx)

  const upgraded = isEpub2(opened)
    ? await upgradeEpubStep(opened, pipelineCtx)
    : opened

  if (!upgraded) {
    // maybe do something
    return
  }

  const metadata = await extractEpubMetadataStep(upgraded, ctx)

  const manifest = isReadaloud(metadata)
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
