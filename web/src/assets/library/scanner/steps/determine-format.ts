import { type Epub } from "@storyteller-platform/epub"

import { defineStep } from "@/assets/library/scanner/step2"
import {
  type EpubOpened,
  type FormatKnown,
} from "@/assets/library/scanner/types"

const STEP = "determine-format"

type OpenedUnknown = EpubOpened & {
  missing: false
  fileHash: string
  fileSize: number | null
  changed: boolean
  isEpub2: false
  epub: Epub
}

export type DetermineFormatInput = OpenedUnknown
export type DetermineFormatOutput = FormatKnown

export const determineFormatStep = defineStep(
  STEP,
  async (input: DetermineFormatInput, ctx) => {
    const manifest = await input.epub.getManifest()
    const hasMediaOverlays = Object.values(manifest).some(
      (item) => item.mediaOverlay,
    )
    const format = hasMediaOverlays ? "readaloud" : "ebook"

    ctx.report.info({
      step: STEP,
      format,
      msg: `Determined format as ${format}`,
    })

    if (format === "ebook") {
      return { ...input, format: "ebook" }
    }

    return { ...input, format: "readaloud" }
  },
)
