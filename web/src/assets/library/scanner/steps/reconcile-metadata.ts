import {
  type PipelineStep,
  type ScanContext,
  isResolvedFormat,
} from "@/assets/library/scanner/types"
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

function buildFormatRelation(ctx: ScanContext): BookRelationsUpdate {
  const shared = {
    manifest: JSON.stringify(ctx.manifest ?? null),
    contentHash: ctx.fileHash,
    missing: false,
    fileSize: ctx.fileSize,
  }

  if (!isResolvedFormat(ctx.format)) {
    throw new Error(
      `Cannot build format relation for unresolved format "${ctx.format}"`,
    )
  }

  switch (ctx.format) {
    case "ebook":
      return getFormatRelationPatch(ctx, {
        ...shared,
        isEpub2: ctx.isEpub2,
        pageCount: ctx.pageCount,
      })

    case "audiobook":
      return getFormatRelationPatch(ctx, {
        ...shared,
        duration: ctx.duration,
      })

    case "readaloud":
      return getFormatRelationPatch(ctx, {
        ...shared,
        isEpub2: ctx.isEpub2,
        pageCount: ctx.pageCount,
        duration: ctx.duration,
      })
  }
}

function resolveMetadata(
  mode: MetadataOverrideMode,
  current: BookWithRelations,
  extracted: BookUpdate | null,
  extractedRelations: BookRelationsUpdate,
): { metadataUpdate: BookUpdate | null; relationUpdate: BookRelationsUpdate } {
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

function hasChanges(
  ctx: ScanContext,
  metadataUpdate: BookUpdate | null,
  relationUpdate: BookRelationsUpdate,
  currentBook: BookWithRelations,
  format: "ebook" | "audiobook" | "readaloud",
): boolean {
  if (metadataUpdate || Object.keys(relationUpdate).length > 0) {
    return true
  }

  // format fields (manifest, pageCount, duration) are only
  // re-extracted when the file is new or changed
  if (ctx.flags.has("changed") || ctx.flags.has("new")) {
    return true
  }

  const relation = currentBook[format]
  return !relation || relation.missing
}

export const reconcileMetadataStep: PipelineStep = {
  name: "reconcile-metadata",
  async run(ctx) {
    if (!isResolvedFormat(ctx.format)) {
      ctx.logger.error(
        `Format was not resolved before reconciliation (still "${ctx.format}"), skipping`,
      )
      return false
    }

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

    if (!hasChanges(ctx, metadataUpdate, relationUpdate, current, ctx.format)) {
      ctx.logger.debug("No changes to metadata or relations, skipping update")
      return false
    }

    const formatRelation = buildFormatRelation(ctx)

    ctx.logger.debug({
      msg: "Updating metadata and relations",
      metadataUpdate,
      relationUpdate,
      formatRelation,
    })

    // safe cast: relationUpdate and formatRelation have non-overlapping keys,
    // but the spread confuses exactOptionalPropertyTypes
    await updateBook(ctx.bookUuid, metadataUpdate, {
      ...relationUpdate,
      ...formatRelation,
    } as BookRelationsUpdate)

    const updated = await getBook(ctx.bookUuid)
    if (updated) {
      ctx.book = updated
    }

    return undefined
  },
}
