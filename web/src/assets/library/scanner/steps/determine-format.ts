import { type Epub } from "@storyteller-platform/epub"

import { createStep } from "@/assets/library/scanner/step"
import {
  type FormatKnown,
  type UnknownEpubInput,
} from "@/assets/library/scanner/types"

const STEP = "determine-format"

type OpenedUnknown = UnknownEpubInput & {
  missing: false
  fileHash: string
  fileSize: number | null
  changed: boolean
  isEpub2: false
  epub: Epub
}

export type DetermineFormatInput = OpenedUnknown
export type DetermineFormatOutput = FormatKnown

export const determineFormatStep = createStep<
  DetermineFormatInput,
  DetermineFormatOutput
>(STEP, async (input, ctx) => {
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
})
