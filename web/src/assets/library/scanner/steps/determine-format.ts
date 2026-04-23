import { type Epub } from "@storyteller-platform/epub"

import { type ScanCtx } from "@/assets/library/scanner/ctx"
import { type UnknownEpubInput } from "@/assets/library/scanner/types"

const STEP = "determine-format"

type OpenedUnknown = UnknownEpubInput & {
  missing: false
  fileHash: string
  fileSize: number | null
  changed: boolean
  isEpub2: false
  epub: Epub
}

type Classified<F extends "ebook" | "readaloud"> = Omit<
  OpenedUnknown,
  "format"
> & { format: F }

export async function determineFormat(
  input: OpenedUnknown,
  ctx: ScanCtx,
): Promise<Classified<"ebook"> | Classified<"readaloud">> {
  const manifest = await input.epub.getManifest()
  const hasMediaOverlays = Object.values(manifest).some(
    (item) => item.mediaOverlay,
  )
  const format = hasMediaOverlays ? "readaloud" : "ebook"

  ctx.report.info({
    step: STEP,
    bookUuid: input.bookUuid,
    format,
    msg: `Classified EPUB as ${format}`,
  })

  if (format === "ebook") {
    return { ...input, format: "ebook" }
  }
  return { ...input, format: "readaloud" }
}
