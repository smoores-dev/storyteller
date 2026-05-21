import { type Logger } from "pino"

import {
  type ImportMode,
  type MetadataFieldOverrides,
} from "@/database/settingsTypes"

import { type ScanReport } from "./scanReport"

export type ScanSource =
  | "watcher"
  | "manual"
  | "scheduled"
  | "upload"
  | "api"
  | "readaloud-creation"

export type ScanOptions = {
  force?: boolean
  metadataFieldOverrides?: MetadataFieldOverrides
  concurrency?: number
  /** Override the resolved import mode for this scan run. */
  importMode?: ImportMode
}

export type ScanCtx = {
  signal: AbortSignal
  report: ScanReport
  logger: Logger
  source: ScanSource
  options: ScanOptions
  /**
   * fallback import mode for candidates that arrive without a per-rule one.
   * candidate.importMode wins when set.
   */
  defaultImportMode: ImportMode
  setProgress: (processed: number, total: number) => void
}

/**
 * a ScanCtx augmented with a disposable scope. scopes are owned by the
 * per-candidate pipeline so opened epubs and audiobooks get released as soon
 * as one book is done. steps require this type because they may register
 * resources for cleanup.
 */
export type PipelineCtx = ScanCtx & {
  scope: AsyncDisposableStack
}
