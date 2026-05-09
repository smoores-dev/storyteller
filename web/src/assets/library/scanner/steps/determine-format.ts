import { defineStep } from "@/assets/library/scanner/step2"
import {
  type EpubOpened,
  type FormatKnown,
} from "@/assets/library/scanner/types"

const STEP = "determine-format"

export type DetermineFormatInput = EpubOpened
export type DetermineFormatOutput = FormatKnown

/**
 * look at post-epub-2 upgrade epub and check if it has media overlays
 * this is only for new epub files, not for existing books.
 */
export const determineFormatStep = defineStep(
  STEP,
  async (input: DetermineFormatInput, ctx): Promise<DetermineFormatOutput> => {
    if (!input.formatTentative) return input

    const manifest = await input.epub.getManifest()
    const hasMediaOverlays = Object.values(manifest).some(
      (item) => item.mediaOverlay,
    )
    const format = hasMediaOverlays ? "readaloud" : "ebook"

    if (format !== input.format) {
      ctx.report.info({
        step: STEP,
        msg: `Resolved tentative ebook ${input.filepath} as ${format}`,
        book: input.book,
        format,
      })
    }

    if (format === "ebook") {
      return { ...input, format: "ebook", formatTentative: false }
    }
    return { ...input, format: "readaloud", formatTentative: false }
  },
)
