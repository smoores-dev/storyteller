import {
  extractAndPersistAudioCover,
  extractAndPersistTextCover,
  getExtractedCover,
} from "@/assets/covers"
import { type ScanCtx } from "@/assets/library/scanner/ctx"
import { defineStep } from "@/assets/library/scanner/step"
import { getSetting } from "@/database/settings"
import { type MetadataFieldMode } from "@/database/settingsTypes"

import {
  type ExtractedAudiobookMetadata,
  type ExtractedEpubMetadata,
} from "./extract-metadata"

const STEP = "extract-cover"

async function getCoverMode(ctx: ScanCtx): Promise<MetadataFieldMode> {
  const overrides =
    ctx.options.metadataFieldOverrides ??
    (await getSetting("metadataFieldOverrides"))

  return overrides.cover
}

export const extractTextCoverStep = defineStep(
  "extract-text-cover",
  async (input: ExtractedEpubMetadata, ctx) => {
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
      if (mode === "merge") {
        const existing = await getExtractedCover(input.book, "ebook")

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

      const readaloudPath = input.book.readaloud?.filepath ?? null
      const ebookPath =
        input.format === "ebook"
          ? input.filepath
          : input.book.ebook?.filepath ?? null

      await extractAndPersistTextCover(input.book, ebookPath, readaloudPath)

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
  async (input: ExtractedAudiobookMetadata, ctx) => {
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
      if (mode === "merge") {
        const existing = await getExtractedCover(input.book, "audiobook")

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

      const readaloudPath = input.book.readaloud?.filepath ?? null

      await extractAndPersistAudioCover(
        input.book,
        input.filepath,
        readaloudPath,
      )

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
