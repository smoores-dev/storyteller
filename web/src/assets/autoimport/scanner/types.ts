import { type Logger } from "pino"

import { type Audiobook as AudiobookAsset } from "@storyteller-platform/audiobook"
import { type Epub } from "@storyteller-platform/epub"

import {
  type BookRelationsUpdate,
  type BookUpdate,
  type BookWithRelations,
} from "@/database/books"
import { type UUID } from "@/uuid"

export type ScanFormat = "ebook" | "audiobook" | "readaloud"
export type ScanFlag = "missing" | "changed" | "new"

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
  manifest: unknown | null
}

export interface PipelineStep {
  name: string
  run: (ctx: ScanContext, signal: AbortSignal) => Promise<boolean | void>
  cleanup?: (ctx: ScanContext) => Promise<void>
}

export interface PipelineRunnerOptions {
  concurrency: number
  signal: AbortSignal
  onProgress?: (processed: number, total: number) => void
}
