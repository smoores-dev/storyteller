import { type Logger } from "pino"

import { type Audiobook as AudiobookAsset } from "@storyteller-platform/audiobook"
import { type Epub } from "@storyteller-platform/epub"

import { type SerializedManifest } from "@/components/reader/types"
import {
  type BookRelationsUpdate,
  type BookUpdate,
  type BookWithRelations,
} from "@/database/books"
import { type MetadataOverrideMode } from "@/database/settingsTypes"
import { type UUID } from "@/uuid"

export type ScanFormat = "ebook" | "audiobook" | "readaloud" | "epub-unknown"

export type ResolvedEpubFormat = "ebook" | "readaloud"

export type ScanFlag = "missing" | "changed" | "new"

export interface ScanOptions {
  force?: boolean
  metadataOverrideMode?: MetadataOverrideMode
}

export interface ScanContext {
  logger: Logger
  bookUuid: UUID
  format: ScanFormat
  filepath: string
  flags: Set<ScanFlag>
  missing: boolean
  existingHash: string | null
  fileHash: string | null
  epub: Epub | null
  audiobook: AudiobookAsset | null
  extractedMetadata: BookUpdate | null
  extractedRelations: BookRelationsUpdate
  book: BookWithRelations | null
  manifest: SerializedManifest | null
  isEpub2: boolean
  pageCount: number | null
  duration: number | null
  fileSize: number | null
  options: ScanOptions
}

export interface PipelineStep {
  name: string
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  run(ctx: ScanContext, signal: AbortSignal): Promise<boolean | void>
  cleanup?(ctx: ScanContext): Promise<void> | void
}

export function isEpubFormat(format: ScanFormat): boolean {
  return (
    format === "ebook" || format === "readaloud" || format === "epub-unknown"
  )
}

export function isResolvedFormat(
  format: ScanFormat,
): format is "ebook" | "audiobook" | "readaloud" {
  return format !== "epub-unknown"
}
