import { getExtractedCover } from "@/assets/covers"
import { deleteCachedCoverImagesByKind } from "@/assets/fs"
import { cacheAudioCover, cacheTextCover } from "@/assets/library/coverCache"
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
        // covers are scalar, so merge keeps the current cover when there is
        // one and only writes the extracted one when none exists yet.
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
      await deleteCachedCoverImagesByKind(input.book.uuid, "text")
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
  async (input: ExtractedAudiobookMetadata, ctx) => {
    const mode = await getCoverMode(ctx)

    console.log("mode", mode)
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

      await deleteCachedCoverImagesByKind(input.book.uuid, "audio")
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
