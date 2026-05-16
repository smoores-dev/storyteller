import {
  getExtractedAudiobookCover,
  getExtractedEbookCover,
} from "@/assets/covers"
import { deleteCachedCoverImages } from "@/assets/fs"
import { cacheAudioCover, cacheTextCover } from "@/assets/library/coverCache"
import { type ScanCtx } from "@/assets/library/scanner/ctx"
import { defineStep } from "@/assets/library/scanner/step2"
import { type Reconciled } from "@/assets/library/scanner/types"
import { getSetting } from "@/database/settings"
import { type MetadataFieldMode } from "@/database/settingsTypes"

export type ExtractTextCoverInput = Reconciled & {
  format: "ebook" | "readaloud"
}

export type ExtractAudiobookCoverInput = Reconciled & { format: "audiobook" }

const STEP = "extract-cover"

async function getCoverMode(ctx: ScanCtx): Promise<MetadataFieldMode> {
  const overrides =
    ctx.options.metadataFieldOverrides ??
    (await getSetting("metadataFieldOverrides"))

  return overrides.cover
}

export const extractTextCoverStep = defineStep(
  "extract-text-cover",
  async (input: ExtractTextCoverInput, ctx) => {
    const mode = await getCoverMode(ctx)

    if (mode === "skip") {
      ctx.report.skipped({
        step: STEP,
        book: input.book,
        format: input.format,
        reason: "cover-override-skip",
      })
      return input
    }

    try {
      if (mode === "fill-empty") {
        // we check if the cover has already been extracted
        const existing = await getExtractedEbookCover(input.book)

        if (existing) {
          ctx.report.skipped({
            step: STEP,
            book: input.book,
            format: input.format,
            reason: "cover-already-exists",
          })
          return input
        }
      }
      await deleteCachedCoverImages(input.book.uuid)
      await cacheTextCover(input.book)
      return input
    } catch (error) {
      ctx.report.warn({
        step: STEP,
        book: input.book,
        msg: "Failed to get extracted ebook cover. Continuing...",
        err: error,
      })
      return input
    }
  },
)

export const extractAudiobookCoverStep = defineStep(
  "extract-audiobook-cover",
  async (input: ExtractAudiobookCoverInput, ctx) => {
    const mode = await getCoverMode(ctx)

    if (mode === "skip") {
      ctx.report.skipped({
        step: STEP,
        book: input.book,
        format: input.format,
        reason: "cover-override-skip",
      })
      return input
    }

    try {
      if (mode === "fill-empty") {
        const existing = await getExtractedAudiobookCover(input.book)
        if (existing) {
          ctx.report.skipped({
            step: STEP,
            book: input.book,
            format: input.format,
            reason: "cover-already-exists",
          })
          return input
        }
      }

      await cacheAudioCover(input.book)
      return input
    } catch (error) {
      ctx.report.warn({
        step: STEP,
        book: input.book,
        msg: "Failed to get extracted audiobook cover. Continuing...",
        err: error,
      })
      return input
    }
  },
)
