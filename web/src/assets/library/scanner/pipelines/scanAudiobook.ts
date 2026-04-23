import { type ScanCtx } from "@/assets/library/scanner/ctx"
import { checkExists } from "@/assets/library/scanner/steps/check-exists"
import { computeHash } from "@/assets/library/scanner/steps/compute-hash"
import { extractAudiobookCover } from "@/assets/library/scanner/steps/extract-covers"
import { extractAudiobookManifest } from "@/assets/library/scanner/steps/extract-manifest"
import { extractAudiobookMetadata } from "@/assets/library/scanner/steps/extract-metadata"
import { openAudiobook } from "@/assets/library/scanner/steps/open-audiobook"
import { reconcileMetadata } from "@/assets/library/scanner/steps/reconcile-metadata"
import { type AudiobookInput } from "@/assets/library/scanner/types"

export async function scanAudiobook(input: AudiobookInput, ctx: ScanCtx) {
  await using scope = new AsyncDisposableStack()

  const existing = await checkExists(input, ctx)
  if (!existing) return

  const hashed = await computeHash(existing, ctx)
  const opened = await openAudiobook(hashed, ctx, scope)
  if (!opened) return

  const metadata = await extractAudiobookMetadata(opened)
  const manifest = await extractAudiobookManifest(metadata)
  const reconciled = await reconcileMetadata(manifest, ctx)
  if (!reconciled) return

  await extractAudiobookCover(reconciled)
  ctx.report.succeeded({
    step: "scan-audiobook",
    bookUuid: reconciled.bookUuid,
    format: "audiobook",
  })
}
