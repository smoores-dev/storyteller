import { type ScanCtx } from "@/assets/library/scanner/ctx"
import { checkExists } from "@/assets/library/scanner/steps/check-exists"
import { computeHash } from "@/assets/library/scanner/steps/compute-hash"
import { extractTextCover } from "@/assets/library/scanner/steps/extract-covers"
import { extractReadaloudManifest } from "@/assets/library/scanner/steps/extract-manifest"
import { extractEpubMetadata } from "@/assets/library/scanner/steps/extract-metadata"
import { openEpub } from "@/assets/library/scanner/steps/open-epub"
import { reconcileMetadata } from "@/assets/library/scanner/steps/reconcile-metadata"
import { upgradeEpub } from "@/assets/library/scanner/steps/upgrade-epub"
import {
  type FormatKnown,
  type ReadaloudInput,
} from "@/assets/library/scanner/types"

export async function scanReadaloud(input: ReadaloudInput, ctx: ScanCtx) {
  await using scope = new AsyncDisposableStack()

  const existing = await checkExists(input, ctx)
  if (!existing) return

  const hashed = await computeHash(existing, ctx)
  const opened = await openEpub(hashed, ctx, scope)
  if (!opened) return

  const upgraded = await upgradeEpub(opened, ctx)
  if (!upgraded) return

  const reconciled = await readaloudTail(upgraded, ctx)
  if (!reconciled) return

  await extractTextCover(reconciled)
  ctx.report.succeeded({
    step: "scan-readaloud",
    bookUuid: reconciled.bookUuid,
    format: "readaloud",
  })
}

export async function readaloudTail<
  T extends FormatKnown & { format: "readaloud" },
>(input: T, ctx: ScanCtx) {
  const metadata = await extractEpubMetadata(input)
  const manifest = await extractReadaloudManifest(metadata, ctx)
  return reconcileMetadata(manifest, ctx)
}
