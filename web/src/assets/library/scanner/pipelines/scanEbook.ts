import { type ScanCtx } from "@/assets/library/scanner/ctx"
import { checkExists } from "@/assets/library/scanner/steps/check-exists"
import { computeHash } from "@/assets/library/scanner/steps/compute-hash"
import { extractTextCover } from "@/assets/library/scanner/steps/extract-covers"
import { extractEbookManifest } from "@/assets/library/scanner/steps/extract-manifest"
import { extractEpubMetadata } from "@/assets/library/scanner/steps/extract-metadata"
import { openEpub } from "@/assets/library/scanner/steps/open-epub"
import { reconcileMetadata } from "@/assets/library/scanner/steps/reconcile-metadata"
import { upgradeEpub } from "@/assets/library/scanner/steps/upgrade-epub"
import {
  type EbookInput,
  type FormatKnown,
} from "@/assets/library/scanner/types"

export async function scanEbook(input: EbookInput, ctx: ScanCtx) {
  await using scope = new AsyncDisposableStack()

  const existing = await checkExists(input, ctx)
  if (!existing) return

  const hashed = await computeHash(existing, ctx)
  const opened = await openEpub(hashed, ctx, scope)
  if (!opened) return

  const upgraded = await upgradeEpub(opened, ctx)
  if (!upgraded) return

  const reconciled = await ebookTail(upgraded, ctx)
  if (!reconciled) return

  await extractTextCover(reconciled)
  ctx.report.succeeded({
    step: "scan-ebook",
    bookUuid: reconciled.bookUuid,
    format: "ebook",
  })
}

export async function ebookTail<T extends FormatKnown & { format: "ebook" }>(
  input: T,
  ctx: ScanCtx,
) {
  const metadata = await extractEpubMetadata(input)
  const manifest = await extractEbookManifest(metadata, ctx)
  return reconcileMetadata(manifest, ctx)
}
