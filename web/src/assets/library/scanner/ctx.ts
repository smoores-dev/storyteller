import { type Logger } from "pino"

import { type MetadataOverrideMode } from "@/database/settingsTypes"

import { type ScanReport } from "./scanReport"

export type ScanSource = "watcher" | "manual" | "scheduled"

export type ScanOptions = {
  force?: boolean
  metadataOverrideMode?: MetadataOverrideMode
  concurrency?: number
}

export type ScanCtx = {
  signal: AbortSignal
  report: ScanReport
  logger: Logger
  source: ScanSource
  options: ScanOptions
  scope?: AsyncDisposableStack
  setProgress: (processed: number, total: number) => void
}
