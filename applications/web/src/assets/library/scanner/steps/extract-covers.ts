import { type ScanCtx } from "@/assets/library/scanner/ctx"
import { defineStep } from "@/assets/library/scanner/step"
import { type BookWithRelations } from "@/database/books"
import {
  type CoverFormat,
  getFormatCover,
  setFormatCover,
} from "@/database/images"
import { getSetting } from "@/database/settings"
import { type MetadataFieldMode } from "@/database/settingsTypes"
import {
  extractAudioCover,
  extractTextCover,
  ingestCover,
  shouldExtractCover,
} from "@/images/covers"
import { type UUID } from "@/uuid"

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

async function attachToSiblings(
  book: BookWithRelations,
  scanned: CoverFormat,
  siblings: CoverFormat[],
  imageUuid: UUID,
) {
  for (const format of siblings) {
    if (format === scanned) continue

    const row = book[format]
    if (!row) continue

    await setFormatCover(format, book.uuid, {
      imageUuid,
      origin: "extracted",
      extractedFrom: row.fingerprint,
    })
  }
}

export const extractTextCoverStep = defineStep(
  "extract-text-cover",
  async (input: ExtractedEpubMetadata, ctx) => {
    const mode = await getCoverMode(ctx)
    const current = await getFormatCover(input.format, input.book.uuid)

    if (!shouldExtractCover(mode, current, input.fingerprint)) {
      ctx.report.skipped({
        step: STEP,
        book: input.book,
        format: input.format,
        reason:
          mode === "skip" ? "cover-override-skip" : "cover-already-exists",
      })
      return input
    }

    try {
      // pipeline already has input.epub open; reuse it instead of opening
      // the same zip a second time. for the other format (when present), we
      // still have to open the file fresh — that handle isn't on input.
      const ebookSource =
        input.format === "ebook"
          ? input.epub
          : input.book.ebook?.filepath ?? null
      const readaloudSource =
        input.format === "readaloud"
          ? input.epub
          : input.book.readaloud?.filepath ?? null

      const cover = await extractTextCover({
        ebook: ebookSource,
        readaloud: readaloudSource,
      })
      if (!cover) return input

      const image = await ingestCover(cover)
      if (!image) return input

      await attachToSiblings(
        input.book,
        input.format,
        ["ebook", "readaloud"],
        image.uuid,
      )

      return {
        ...input,
        coverImageUuid: image.uuid,
        coverExtractedFrom: input.fingerprint,
      }
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
    const current = await getFormatCover("audiobook", input.book.uuid)

    if (!shouldExtractCover(mode, current, input.fingerprint)) {
      ctx.report.skipped({
        step: STEP,
        book: input.book,
        format: input.format,
        reason:
          mode === "skip" ? "cover-override-skip" : "cover-already-exists",
      })
      return input
    }

    try {
      const cover = await extractAudioCover({
        audiobook: input.audiobook,
        readaloud: input.book.readaloud?.filepath ?? null,
        audiobookDir: input.filepath,
      })
      if (!cover) return input

      const image = await ingestCover(cover)
      if (!image) return input

      return {
        ...input,
        coverImageUuid: image.uuid,
        coverExtractedFrom: input.fingerprint,
      }
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
