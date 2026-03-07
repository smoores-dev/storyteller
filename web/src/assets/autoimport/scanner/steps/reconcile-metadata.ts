import { getBook, updateBook, type BookRelationsUpdate } from "@/database/books"

import { keepMissingMetadata, keepMissingRelations } from "@/assets/metadata"

import { type PipelineStep, type ScanContext } from "../types"
import { getFormatRelationPatch } from "./utils"

function withFormatFields(ctx: ScanContext): BookRelationsUpdate {
  if (ctx.format === "ebook") {
    return getFormatRelationPatch(ctx, {
      manifest: ctx.manifest,
      contentHash: ctx.fileHash,
      missing: false,
    })
  }

  return getFormatRelationPatch(ctx, {
    manifest: ctx.manifest,
    duration: ctx.duration,
    contentHash: ctx.fileHash,
    missing: false,
  })
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
      return
    }

    ctx.book = updated
  },
}
