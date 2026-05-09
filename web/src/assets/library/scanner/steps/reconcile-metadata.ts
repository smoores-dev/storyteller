import { getFormatRelationPatch } from "@/assets/library/scanner/formatRelations"
import { defineStep } from "@/assets/library/scanner/step2"
import {
  type ManifestReady,
  type Reconciled,
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

const STEP = "reconcile-metadata"

export type ReconcileMetadataInput = ManifestReady
export type ReconcileMetadataOutput = Reconciled

function buildFormatRelation(input: ManifestReady): BookRelationsUpdate {
  const shared = {
    manifest: JSON.stringify(input.manifest),
    contentHash: input.fileHash,
    missing: false,
    fileSize: input.fileSize,
  }

  if (input.format === "ebook") {
    return getFormatRelationPatch(input, {
      ...shared,
      isEpub2: input.isEpub2,
      pageCount: input.pageCount,
    })
  }

  if (input.format === "audiobook") {
    return getFormatRelationPatch(input, {
      ...shared,
      duration: input.duration,
    })
  }

  return getFormatRelationPatch(input, {
    ...shared,
    isEpub2: input.isEpub2,
    pageCount: input.pageCount,
    duration: input.duration,
  })
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
    return { metadataUpdate: extracted, relationUpdate: extractedRelations }
  }

  return {
    metadataUpdate: keepMissingMetadata(current, extracted),
    relationUpdate: keepMissingRelations(current, extractedRelations),
  }
}

function hasChanges(
  input: ManifestReady,
  metadataUpdate: BookUpdate | null,
  relationUpdate: BookRelationsUpdate,
  currentBook: BookWithRelations,
): boolean {
  if (metadataUpdate || Object.keys(relationUpdate).length > 0) return true
  if (input.changed) return true

  const relation = currentBook[input.format]
  return !relation || relation.missing
}

/**
 * Reconciles the extracted metadata from the book file with the current metadata in the database.
 */
export const reconcileMetadataStep = defineStep(
  "reconcile-metadata",
  async (input: ReconcileMetadataInput, ctx) => {
    const current = await getBook(input.book.uuid)
    if (!current) {
      ctx.report.warn({
        step: STEP,
        msg: `Book no longer exists during scan reconciliation for book ${input.book.title} (${input.format})`,
      })
      return null
    }

    const mode =
      ctx.options.metadataOverrideMode ??
      (await getSetting("metadataOverrideMode"))

    const { metadataUpdate, relationUpdate } = resolveMetadata(
      mode,
      current,
      input.extractedMetadata,
      input.extractedRelations,
    )

    if (!hasChanges(input, metadataUpdate, relationUpdate, current)) {
      ctx.report.skipped({
        step: STEP,
        book: input.book,
        format: input.format,
        reason: "no-metadata-changes",
      })
      return null
    }

    const formatRelation = buildFormatRelation(input)

    await updateBook(input.bookUuid, metadataUpdate, {
      ...relationUpdate,
      ...formatRelation,
    } as BookRelationsUpdate)

    const updated = await getBook(input.bookUuid)
    if (!updated) {
      ctx.report.warn({
        step: STEP,
        msg: `Book disappeared after metadata reconciliation for book ${input.book.title} (${input.format})`,
      })
      return null
    }

    return { ...input, book: updated } as ManifestReady & Reconciled
  },
)
