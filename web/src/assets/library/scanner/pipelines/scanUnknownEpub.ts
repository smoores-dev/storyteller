import { type ScanCtx } from "@/assets/library/scanner/ctx"
import { ebookTail } from "@/assets/library/scanner/pipelines/scanEbook"
import { readaloudTail } from "@/assets/library/scanner/pipelines/scanReadaloud"
import { checkExists } from "@/assets/library/scanner/steps/check-exists"
import { computeHash } from "@/assets/library/scanner/steps/compute-hash"
import { determineFormat } from "@/assets/library/scanner/steps/determine-format"
import { extractTextCover } from "@/assets/library/scanner/steps/extract-covers"
import { openEpub } from "@/assets/library/scanner/steps/open-epub"
import { upgradeEpub } from "@/assets/library/scanner/steps/upgrade-epub"
import { type UnknownEpubInput } from "@/assets/library/scanner/types"

export async function scanUnknownEpub(input: UnknownEpubInput, ctx: ScanCtx) {
  await using scope = new AsyncDisposableStack()

  const existing = await checkExists(input, ctx)
  if (!existing) return

  const hashed = await computeHash(existing, ctx)
  const opened = await openEpub(hashed, ctx, scope)
  if (!opened) return

  const upgraded = await upgradeEpub(opened, ctx)
  if (!upgraded) return

  const classified = await determineFormat(upgraded, ctx)

  const reconciled =
    classified.format === "ebook"
      ? await ebookTail(classified, ctx)
      : await readaloudTail(classified, ctx)

  if (!reconciled) return

  await extractTextCover(reconciled)
  ctx.report.succeeded({
    step: "scan-unknown-epub",
    bookUuid: reconciled.bookUuid,
    format: reconciled.format,
  })
}
