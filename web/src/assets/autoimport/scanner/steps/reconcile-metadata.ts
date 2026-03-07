import {
  type PipelineStep,
  type ScanContext,
} from "@/assets/autoimport/scanner/types"
import { keepMissingMetadata, keepMissingRelations } from "@/assets/metadata"
import { type SerializedManifest } from "@/components/reader/types"
import { type BookRelationsUpdate, getBook, updateBook } from "@/database/books"

import { getFormatRelationPatch, normalizeManifestValue } from "./utils"

function withFormatFields(ctx: ScanContext): BookRelationsUpdate {
  switch (ctx.format) {
    case "ebook":
      return getFormatRelationPatch(ctx, {
        manifest: JSON.stringify(ctx.manifest ?? null),
        contentHash: ctx.fileHash,
        missing: false,
        pageCount: ctx.pageCount,
        duration: ctx.duration,
        fileSize: ctx.fileSize,
      })
    case "audiobook":
      return getFormatRelationPatch(ctx, {
        manifest: JSON.stringify(ctx.manifest ?? null),
        contentHash: ctx.fileHash,
        missing: false,
        pageCount: ctx.pageCount,
        duration: ctx.duration,
        fileSize: ctx.fileSize,
      })
    case "readaloud":
      return getFormatRelationPatch(ctx, {
        manifest: JSON.stringify(ctx.manifest ?? null),
        contentHash: ctx.fileHash,
        missing: false,
        pageCount: ctx.pageCount,
        duration: ctx.duration,
        fileSize: ctx.fileSize,
      })
    default: {
      const format: never = ctx.format
      throw new Error(`Invalid format: ${format as string}`)
    }
  }
}

export const reconcileMetadataStep: PipelineStep = {
  name: "reconcile-metadata",
  async run(ctx) {
    const current = await getBook(ctx.bookUuid)
    if (!current) {
      return false
    }

    ctx.book = current

    const metadataUpdate = keepMissingMetadata(current, ctx.extractedMetadata)
    const relationUpdate = keepMissingRelations(current, ctx.extractedRelations)

    await updateBook(ctx.bookUuid, metadataUpdate, {
      ...relationUpdate,
      ...withFormatFields(ctx),
    })

    const updated = await getBook(ctx.bookUuid)
    if (!updated) {
      return undefined
    }

    ctx.book = updated
    return undefined
  },
}
