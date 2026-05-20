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
  /** Resolved at scan() entry. Falls back to the global setting. */
  importMode: ImportMode
  scope?: AsyncDisposableStack
  setProgress: (processed: number, total: number) => void
}
