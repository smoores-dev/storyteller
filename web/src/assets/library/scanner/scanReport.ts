import { type Logger } from "pino"

import { type ScanSource } from "@/assets/library/scanner/ctx"
import { type UUID } from "@/uuid"

import { type ResolvedScanFormat } from "./types"

type BaseEntry = {
  ts: number
  step: string
  bookUuid?: UUID
  format?: ResolvedScanFormat
}

export type ReportEntry =
  | (BaseEntry & { kind: "info"; msg: string })
  | (BaseEntry & { kind: "warn"; msg: string; err?: unknown })
  | (BaseEntry & {
      kind: "skip"
      reason: string
      bookUuid: UUID
      format: ResolvedScanFormat
    })
  | (BaseEntry & {
      kind: "failed"
      err: unknown
      bookUuid: UUID
      format: ResolvedScanFormat
    })
  | (BaseEntry & {
      kind: "succeeded"
      bookUuid: UUID
      format: ResolvedScanFormat
    })

type ReportCounts = {
  info: number
  warn: number
  skipped: number
  failed: number
  succeeded: number
}

export class ScanReport {
  private readonly entries: ReportEntry[] = []
  private readonly succeededBooksSet = new Set<UUID>()
  private readonly failedBooksSet = new Set<UUID>()
  private readonly skippedBooksSet = new Set<UUID>()
  private finishedAtValue: number | null = null

  constructor(
    private readonly baseLogger: Logger,
    readonly startedAt: number,
    readonly source: ScanSource,
  ) {}

  get logger(): Logger {
    return this.baseLogger
  }

  get finishedAt(): number | null {
    return this.finishedAtValue
  }

  finish() {
    this.finishedAtValue = Date.now()
  }

  info(input: {
    step: string
    msg: string
    bookUuid?: UUID
    format?: ResolvedScanFormat
  }) {
    this.baseLogger.info({
      msg: input.msg,
      step: input.step,
      bookUuid: input.bookUuid,
      format: input.format,
    })

    this.entries.push({
      kind: "info",
      ts: Date.now(),
      step: input.step,
      msg: input.msg,
      bookUuid: input.bookUuid,
      format: input.format,
    })
  }

  warn(input: {
    step: string
    msg: string
    bookUuid?: UUID
    format?: ResolvedScanFormat
    err?: unknown
  }) {
    this.baseLogger.warn({
      msg: input.msg,
      step: input.step,
      bookUuid: input.bookUuid,
      format: input.format,
      err: input.err,
    })

    this.entries.push({
      kind: "warn",
      ts: Date.now(),
      step: input.step,
      msg: input.msg,
      bookUuid: input.bookUuid,
      format: input.format,
      err: input.err,
    })
  }

  skipped(input: {
    step: string
    reason: string
    bookUuid: UUID
    format: ResolvedScanFormat
  }) {
    this.baseLogger.info({
      msg: "scan step skipped",
      step: input.step,
      reason: input.reason,
      bookUuid: input.bookUuid,
      format: input.format,
    })

    this.entries.push({
      kind: "skip",
      ts: Date.now(),
      step: input.step,
      reason: input.reason,
      bookUuid: input.bookUuid,
      format: input.format,
    })

    this.skippedBooksSet.add(input.bookUuid)
  }

  failed(input: {
    step: string
    bookUuid: UUID
    format: ResolvedScanFormat
    err: unknown
  }) {
    this.baseLogger.error({
      msg: "scan step failed",
      step: input.step,
      bookUuid: input.bookUuid,
      format: input.format,
      err: input.err,
    })

    this.entries.push({
      kind: "failed",
      ts: Date.now(),
      step: input.step,
      bookUuid: input.bookUuid,
      format: input.format,
      err: input.err,
    })

    this.failedBooksSet.add(input.bookUuid)
  }

  succeeded(input: {
    step: string
    bookUuid: UUID
    format: ResolvedScanFormat
  }) {
    this.entries.push({
      kind: "succeeded",
      ts: Date.now(),
      step: input.step,
      bookUuid: input.bookUuid,
      format: input.format,
    })

    this.succeededBooksSet.add(input.bookUuid)
  }

  outcomes(): ReportEntry[] {
    return [...this.entries]
  }

  booksSucceeded(): Set<UUID> {
    return new Set(this.succeededBooksSet)
  }

  booksFailed(): Set<UUID> {
    return new Set(this.failedBooksSet)
  }

  booksSkipped(): Set<UUID> {
    return new Set(this.skippedBooksSet)
  }

  counts(): ReportCounts {
    return this.entries.reduce<ReportCounts>(
      (acc, entry) => {
        if (entry.kind === "info") {
          acc.info += 1
          return acc
        }

        if (entry.kind === "warn") {
          acc.warn += 1
          return acc
        }

        if (entry.kind === "skip") {
          acc.skipped += 1
          return acc
        }

        if (entry.kind === "failed") {
          acc.failed += 1
          return acc
        }

        acc.succeeded += 1
        return acc
      },
      { info: 0, warn: 0, skipped: 0, failed: 0, succeeded: 0 },
    )
  }

  toJSON() {
    return {
      source: this.source,
      startedAt: this.startedAt,
      finishedAt: this.finishedAtValue,
      counts: this.counts(),
      outcomes: this.outcomes(),
    }
  }
}
