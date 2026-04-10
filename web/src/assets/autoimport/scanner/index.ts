import { logger } from "@/logging"

import { runPipeline } from "./runner"
import { checkExistsStep } from "./steps/check-exists"
import { computeHashStep } from "./steps/compute-hash"
import { extractCoversStep } from "./steps/extract-covers"
import { extractManifestStep } from "./steps/extract-manifest"
import { extractMetadataStep } from "./steps/extract-metadata"
import { openAudiobookStep } from "./steps/open-audiobook"
import { openEpubStep } from "./steps/open-epub"
import { reconcileMetadataStep } from "./steps/reconcile-metadata"
import {
  type ScanContext,
  type ScanFlag,
  type ScanFormat,
  type ScanOptions,
} from "./types"

const steps = [
  checkExistsStep,
  computeHashStep,
  openEpubStep,
  openAudiobookStep,
  extractMetadataStep,
  extractCoversStep,
  extractManifestStep,
  reconcileMetadataStep,
] as const

export function createScanContext(input: {
  bookUuid: ScanContext["bookUuid"]
  filepath: string
  format: ScanFormat
  missing: boolean
  existingHash: string | null
  flags?: ScanFlag[]
  book: ScanContext["book"]
  options?: ScanOptions
}): ScanContext {
  return {
    logger,
    bookUuid: input.bookUuid,
    filepath: input.filepath,
    format: input.format,
    flags: new Set(input.flags ?? []),
    missing: input.missing,
    existingHash: input.existingHash,
    fileHash: null,
    epub: null,
    audiobook: null,
    extractedMetadata: null,
    extractedRelations: {},
    book: input.book,
    manifest: null,
    isEpub2: false,
    pageCount: null,
    duration: null,
    fileSize: null,
    options: input.options ?? {},
  }
}

export async function runBookScanPipeline(
  contexts: ScanContext[],
  signal: AbortSignal,
) {
  await runPipeline(contexts, [...steps], {
    concurrency: contexts.length === 1 ? 1 : 2,
    signal,
    onProgress(processed, total) {
      logger.debug(`scan pipeline progress ${processed}/${total}`)
    },
  })
}

export type { ScanContext, ScanFlag, ScanFormat, ScanOptions } from "./types"
