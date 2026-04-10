import {
  type PipelineStep,
  type ScanContext,
} from "@/assets/autoimport/scanner/types"
import { keepMissingMetadata, keepMissingRelations } from "@/assets/metadata"
import {
  type BookRelationsUpdate,
  type BookUpdate,
  type BookWithRelations,
  getBook,
  updateBook,
} from "@/database/books"
import { getSetting } from "@/database/settings"
import { type MetadataOverrideMode } from "@/database/settingsTypes"

import { getFormatRelationPatch } from "./utils"

function withFormatFields(ctx: ScanContext): BookRelationsUpdate {
  switch (ctx.format) {
    case "ebook":
      return getFormatRelationPatch(ctx, {
        manifest: JSON.stringify(ctx.manifest ?? null),
        contentHash: ctx.fileHash,
        missing: false,
        isEpub2: ctx.isEpub2,
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
        isEpub2: ctx.isEpub2,
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

function resolveMetadata(
  mode: MetadataOverrideMode,
  current: BookWithRelations,
  extracted: BookUpdate | null,
  extractedRelations: BookRelationsUpdate,
): { metadataUpdate: BookUpdate | null; relationUpdate: BookRelationsUpdate } {
  console.log({
    mode,
    current,
    extracted,
    extractedRelations,
  })
  if (mode === "never") {
    return { metadataUpdate: null, relationUpdate: {} }
  }

  if (mode === "always") {
    return {
      metadataUpdate: extracted,
      relationUpdate: extractedRelations,
    }
  }

  return {
    metadataUpdate: keepMissingMetadata(current, extracted),
    relationUpdate: keepMissingRelations(current, extractedRelations),
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

    const mode =
      ctx.options.metadataOverrideMode ??
      (await getSetting("metadataOverrideMode"))

    const { metadataUpdate, relationUpdate } = resolveMetadata(
      mode,
      current,
      ctx.extractedMetadata,
      ctx.extractedRelations,
    )

    console.log("relationUpdate", {
      ...relationUpdate,
      ...withFormatFields(ctx),
    })
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
