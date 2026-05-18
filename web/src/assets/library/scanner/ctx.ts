import { type Logger } from "pino"

import { type MetadataFieldOverrides } from "@/database/settingsTypes"

import { type ScanReport } from "./scanReport"

export type ScanSource = "watcher" | "manual" | "scheduled" | "upload" | "api"

export type ScanOptions = {
  force?: boolean
  metadataFieldOverrides?: MetadataFieldOverrides
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
