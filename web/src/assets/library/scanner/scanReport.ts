import { type Logger } from "pino"

import { type ScanSource } from "@/assets/library/scanner/ctx"
import { type BookWithRelations } from "@/database/books"
import { type UUID } from "@/uuid"

import { type ScanFormat } from "./types"

type BaseEntry = {
  ts: number
  step: string
  bookUuid?: UUID
  format?: ScanFormat
}

export enum SkipReason {
  NO_AUDIO_TRACKS = "no-audio-tracks",
  UNCHANGED = "unchanged",
}

export type ReportEntry =
  | (BaseEntry & { kind: "info"; msg: string })
  | (BaseEntry & { kind: "warn"; msg: string; err?: unknown })
  | (BaseEntry & {
      kind: "skip"
      reason: string
      bookTitle: string
      bookUuid: UUID
      format: ScanFormat
    })
  | (BaseEntry & {
      kind: "failed"
      err: unknown
      bookTitle: string
      bookUuid: UUID
      format: ScanFormat
    })
  | (BaseEntry & {
      kind: "succeeded"
      bookTitle: string
      bookUuid: UUID
      format: ScanFormat
    })

type ReportCounts = {
  info: number
  warn: number
  skipped: number
  failed: number
  succeeded: number
}

export type StepTiming = {
  step: string
  durationMs: number
  bookUuid?: UUID
  format?: ScanFormat
}

export type StepTimingAggregate = {
  step: string
  count: number
  totalMs: number
  avgMs: number
}

export type ScanFailure = {
  step: string
  bookUuid: UUID
  bookTitle: string
  format: ScanFormat
  errMsg: string
}

export type ScanBookEntry = {
  bookUuid: UUID
  bookTitle: string
}

export type ScanSummary = {
  source: ScanSource
  startedAt: number
  finishedAt: number | null
  durationMs: number
  tasks: string[]
  counts: {
    inputs: number
    succeeded: number
    skipped: number
    failed: number
  }
  addedBooks: ScanBookEntry[]
  newlyMissingBooks: ScanBookEntry[]
  skipsByReason: Record<string, number>
  timingsByStep: StepTimingAggregate[]
  failures: ScanFailure[]
}

function formatBookMessage(input: {
  step: string
  msg: string
  book?: BookWithRelations
  format?: ScanFormat
}): string {
  return input.book
    ? `[${input.step}] ${input.msg} for book ${input.book.title} (${input.format})`
    : input.msg
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = ((ms % 60_000) / 1000).toFixed(1)
  return `${minutes}m ${seconds}s`
}

function pad(value: string | number, width: number): string {
  return String(value).padStart(width)
}

export class ScanReport {
  private readonly entries: ReportEntry[] = []
  private readonly succeededBooksSet = new Set<UUID>()
  private readonly failedBooksSet = new Set<UUID>()
  private readonly skippedBooksSet = new Set<UUID>()
  private readonly addedBooksMap = new Map<UUID, string>()
  private readonly newlyMissingBooksMap = new Map<UUID, string>()
  private readonly timings: StepTiming[] = []
  private inputsTotal = 0
  private tasksValue: string[] = []
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

  setTasks(tasks: string[]) {
    this.tasksValue = tasks
  }

  setInputsTotal(total: number) {
    this.inputsTotal = total
  }

  recordAdded(bookUuid: UUID, bookTitle: string) {
    this.addedBooksMap.set(bookUuid, bookTitle)
  }

  recordNewlyMissing(bookUuid: UUID, bookTitle: string) {
    this.newlyMissingBooksMap.set(bookUuid, bookTitle)
  }

  recordTiming(timing: StepTiming) {
    this.timings.push(timing)
  }

  info(input: {
    step: string
    msg: string
    book?: BookWithRelations
    format?: ScanFormat
  }) {
    this.baseLogger.info({
      msg: formatBookMessage(input),
    })

    this.entries.push({
      kind: "info",
      ts: Date.now(),
      step: input.step,
      msg: input.msg,
      bookUuid: input.book?.uuid,
      format: input.format,
    })
  }

  warn(input: {
    step: string
    msg: string
    book?: BookWithRelations
    format?: ScanFormat
    err?: unknown
  }) {
    this.baseLogger.warn({
      msg: formatBookMessage(input),
      err: input.err,
    })

    this.entries.push({
      kind: "warn",
      ts: Date.now(),
      step: input.step,
      msg: input.msg,
      bookUuid: input.book?.uuid,
      format: input.format,
      err: input.err,
    })
  }

  skipped(input: {
    step: string
    reason: string
    book: BookWithRelations
    format: ScanFormat
  }) {
    this.baseLogger.debug({
      msg: formatBookMessage({
        ...input,
        msg: `Skipped for reason: ${input.reason}`,
      }),
    })

    this.entries.push({
      kind: "skip",
      ts: Date.now(),
      step: input.step,
      reason: input.reason,
      bookTitle: input.book.title,
      bookUuid: input.book.uuid,
      format: input.format,
    })

    this.skippedBooksSet.add(input.book.uuid)
  }

  failed(input: {
    step: string
    book: BookWithRelations
    format: ScanFormat
    err: unknown
  }) {
    this.entries.push({
      kind: "failed",
      ts: Date.now(),
      step: input.step,
      bookTitle: input.book.title,
      bookUuid: input.book.uuid,
      format: input.format,
      err: input.err,
    })

    this.failedBooksSet.add(input.book.uuid)
  }

  succeeded(input: {
    step: string
    book: BookWithRelations
    format: ScanFormat
  }) {
    this.baseLogger.debug({
      msg: formatBookMessage({ ...input, msg: `Succeeded` }),
    })

    this.entries.push({
      kind: "succeeded",
      ts: Date.now(),
      step: input.step,
      bookTitle: input.book.title,
      bookUuid: input.book.uuid,
      format: input.format,
    })

    this.succeededBooksSet.add(input.book.uuid)
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
        if (entry.kind === "info") acc.info += 1
        else if (entry.kind === "warn") acc.warn += 1
        else if (entry.kind === "skip") acc.skipped += 1
        else if (entry.kind === "failed") acc.failed += 1
        else acc.succeeded += 1
        return acc
      },
      { info: 0, warn: 0, skipped: 0, failed: 0, succeeded: 0 },
    )
  }

  timingsByStep(): StepTimingAggregate[] {
    const map = new Map<string, { count: number; totalMs: number }>()
    for (const t of this.timings) {
      const existing = map.get(t.step) ?? { count: 0, totalMs: 0 }
      existing.count += 1
      existing.totalMs += t.durationMs
      map.set(t.step, existing)
    }
    return [...map.entries()]
      .map(([step, { count, totalMs }]) => ({
        step,
        count,
        totalMs,
        avgMs: count > 0 ? totalMs / count : 0,
      }))
      .sort((a, b) => b.totalMs - a.totalMs)
  }

  skipsByReason(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const entry of this.entries) {
      if (entry.kind !== "skip") continue
      out[entry.reason] = (out[entry.reason] ?? 0) + 1
    }
    return out
  }

  failures(): ScanFailure[] {
    const out: ScanFailure[] = []
    for (const entry of this.entries) {
      if (entry.kind !== "failed") continue
      out.push({
        step: entry.step,
        bookUuid: entry.bookUuid,
        bookTitle: entry.bookTitle,
        format: entry.format,
        errMsg: errorMessage(entry.err),
      })
    }
    return out
  }

  summary(): ScanSummary {
    const finishedAt = this.finishedAtValue ?? Date.now()
    const counts = this.counts()
    return {
      source: this.source,
      startedAt: this.startedAt,
      finishedAt: this.finishedAtValue,
      durationMs: finishedAt - this.startedAt,
      tasks: [...this.tasksValue],
      counts: {
        inputs: this.inputsTotal,
        succeeded: counts.succeeded,
        skipped: counts.skipped,
        failed: counts.failed,
      },
      addedBooks: [...this.addedBooksMap.entries()].map(
        ([bookUuid, bookTitle]) => ({ bookUuid, bookTitle }),
      ),
      newlyMissingBooks: [...this.newlyMissingBooksMap.entries()].map(
        ([bookUuid, bookTitle]) => ({ bookUuid, bookTitle }),
      ),
      skipsByReason: this.skipsByReason(),
      timingsByStep: this.timingsByStep(),
      failures: this.failures(),
    }
  }

  formatSummary(): string {
    const s = this.summary()
    const lines: string[] = ["Scan summary"]

    const tasksStr = formatTasks(s.tasks)
    lines.push(
      `  Source:    ${s.source.padEnd(14)} Duration:  ${formatDuration(s.durationMs)}`,
    )
    if (tasksStr) lines.push(`  Tasks:     ${tasksStr}`)
    lines.push(
      `  Inputs:    ${s.counts.inputs} ` +
        `(${s.counts.succeeded} succeeded, ${s.counts.skipped} skipped, ${s.counts.failed} failed)`,
    )
    if (s.addedBooks.length > 0) {
      lines.push(`  Added (${s.addedBooks.length}):`)
      for (const b of s.addedBooks) {
        lines.push(`    - ${b.bookTitle}`)
      }
    }

    if (s.newlyMissingBooks.length > 0) {
      lines.push(`  Newly missing (${s.newlyMissingBooks.length}):`)
      for (const b of s.newlyMissingBooks) {
        lines.push(`    - ${b.bookTitle}`)
      }
    }

    const skipReasons = Object.entries(s.skipsByReason).sort(
      (a, b) => b[1] - a[1],
    )
    if (skipReasons.length > 0) {
      lines.push(`  Skips by reason:`)
      const widest = Math.max(...skipReasons.map(([reason]) => reason.length))
      for (const [reason, count] of skipReasons) {
        lines.push(`    ${reason.padEnd(widest)}  ${pad(count, 5)}`)
      }
    }

    const timings = s.timingsByStep.slice(0, 5)
    const timingsTotal = s.timingsByStep.reduce((a, t) => a + t.totalMs, 0)
    if (timings.length > 0 && timingsTotal > 0) {
      lines.push(`  Time by step (top ${timings.length}):`)
      const widest = Math.max(...timings.map((t) => t.step.length))
      for (const t of timings) {
        const pct = ((t.totalMs / timingsTotal) * 100).toFixed(0) + "%"
        lines.push(
          `    ${t.step.padEnd(widest)}  ${pad(pct, 4)}  ` +
            `avg: ${pad(formatDuration(t.avgMs), 8)}  total: ${formatDuration(t.totalMs)}`,
        )
      }
    }

    if (s.failures.length > 0) {
      lines.push(`  Failures (${s.failures.length}):`)
      for (const f of s.failures) {
        lines.push(`    - ${f.step} | ${f.bookTitle} (${f.format})`)
        lines.push(`      ${f.errMsg}`)
      }
    }

    return lines.join("\n")
  }

  toJSON() {
    return {
      ...this.summary(),
      outcomes: this.outcomes(),
    }
  }
}

function formatTasks(tasks: string[]): string {
  if (!tasks.length) return ""
  const counts = new Map<string, number>()
  for (const t of tasks) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts.entries()]
    .map(([kind, count]) => (count > 1 ? `${kind}×${count}` : kind))
    .join(", ")
}
