import { getFormatRelationPatch } from "@/assets/library/scanner/formatRelations"
import { defineStep } from "@/assets/library/scanner/step"
import { applyFieldOverrides } from "@/assets/metadata"
import {
  type BookRelationsUpdate,
  type BookUpdate,
  type BookWithRelations,
  getBook,
  updateBook,
} from "@/database/books"
import { getSetting } from "@/database/settings"
import { type MetadataFieldOverrides } from "@/database/settingsTypes"

import {
  type ExtractedAudiobookManifest,
  type ExtractedEbookManifest,
  type ExtractedReadaloudManifest,
} from "./extract-manifest"

export type ManifestReady =
  | ExtractedEbookManifest
  | ExtractedReadaloudManifest
  | ExtractedAudiobookManifest

const STEP = "update-book"

function buildFormatRelation(
  input: ManifestReady,
  current: BookWithRelations,
): BookRelationsUpdate {
  const shared = {
    manifest: JSON.stringify(input.manifest),
    fingerprint: input.fingerprint,
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

  const isNewReadaloudRow = !current.readaloud
  return getFormatRelationPatch(input, {
    ...shared,
    isEpub2: input.isEpub2,
    pageCount: input.pageCount,
    duration: input.duration,
    ...(isNewReadaloudRow && {
      status: "ALIGNED" as const,
      currentStage: "SPLIT_TRACKS" as const,
    }),
  })
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

export const reconcileMetadataStep = defineStep(
  STEP,
  async (input: ManifestReady, ctx) => {
    const current = await getBook(input.book.uuid)
    if (!current) {
      ctx.report.warn({
        step: STEP,
        msg: `Book no longer exists during scan reconciliation for book ${input.book.title} (${input.format})`,
      })
      return null
    }

    const overrides: MetadataFieldOverrides =
      ctx.options.metadataFieldOverrides ??
      (await getSetting("metadataFieldOverrides"))

    const { metadataUpdate, relationUpdate } = applyFieldOverrides(
      overrides,
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

    const formatRelation = buildFormatRelation(input, current)

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

    return { ...input, book: updated }
  },
)
