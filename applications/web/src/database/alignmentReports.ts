import { type Selectable, sql } from "kysely"

import {
  type AlignmentDecisions,
  type AlignmentFacets,
  type AlignmentOverrides,
  type AnyReport,
  type LegacyReport,
  type ReportV4,
  gradeForScore,
  itemDecision,
  normalizeReport,
  overridesToDecisions,
  summarizeReport as summarizeReportView,
} from "@/alignmentReportView"
import type { UUID } from "@/uuid"
import { type AlignmentJobSummary } from "@/work/jobStats"

import {
  getAlignmentDecisions,
  replaceAlignmentDecisions,
} from "./alignmentDecisions"
import { db } from "./connection"
import { type DB } from "./schema"

export type {
  AlignmentDecisions,
  AlignmentOverrides,
  AnyReport,
  LegacyReport,
  ReportV4,
}

export interface AlignmentSummary extends AlignmentJobSummary {
  band: number
  confidence: number | null
  missingSentences: number
  mutedChapters: number
  failedChapters: number
  unalignedAudio: number
  pending: number
}

export function summarizeReport(
  report: AnyReport,
  decisions?: AlignmentDecisions | null,
  audiobookDuration?: number | null,
): AlignmentSummary {
  const normalized = normalizeReport(report)
  const summary = summarizeReportView(normalized, decisions, audiobookDuration)

  let mutedChapters = 0
  for (const item of normalized.spine) {
    if (item.status !== "aligned") continue
    if (itemDecision(decisions, item.href) === "excluded") continue
    if (item.matchedSeconds + item.interpolatedSeconds === 0) mutedChapters += 1
  }

  return {
    grade: summary.grade,
    band: summary.band,
    score: summary.score,
    confidence: summary.confidence,
    sentenceCoverage: summary.sentenceCoverage,
    audioCoverage: summary.audioCoverage,
    chapters: summary.chapters,
    missingSentences: summary.sentencesTotal - summary.sentencesMatched,
    mutedChapters,
    excluded: summary.excluded,
    excludedByRule: summary.excludedByRule,
    review: summary.review,
    pending: summary.pending,
    failed: summary.failed,
    failedChapters: summary.failed,
    unalignedAudio: summary.looseAudio,
  }
}

function summaryColumns(s: AlignmentSummary) {
  return {
    grade: s.grade,
    score: s.score,
    confidence: s.confidence,
    sentenceCoverage: s.sentenceCoverage,
    audioCoverage: s.audioCoverage,
    chapters: s.chapters,
    missingSentences: s.missingSentences,
    mutedChapters: s.mutedChapters,
    failedChapters: s.failedChapters,
    unalignedAudio: s.unalignedAudio,
  }
}

type AlignmentReportRow = Selectable<DB["alignmentReport"]>

export type AlignmentReport = Omit<
  AlignmentReportRow,
  "uuid" | "jobUuid" | "bookUuid" | "report"
> & {
  uuid: UUID
  jobUuid: UUID | null
  bookUuid: UUID | null
  report: AnyReport | null
}

export async function getAudiobookDuration(
  bookUuid: UUID | null,
): Promise<number | null> {
  if (!bookUuid) return null
  const row = await db
    .selectFrom("audiobook")
    .select("duration")
    .where("bookUuid", "=", bookUuid)
    .executeTakeFirst()
  return row?.duration ?? null
}

export async function createAlignmentReport(input: {
  jobUuid: UUID | null
  bookUuid: UUID | null
  report: AnyReport
}): Promise<{ report: AlignmentReport; summary: AlignmentSummary }> {
  const report = normalizeReport(input.report)
  const s = summarizeReport(
    report,
    input.bookUuid ? await getAlignmentDecisions(input.bookUuid) : null,
    await getAudiobookDuration(input.bookUuid),
  )

  const row = await db.transaction().execute(async (tr) => {
    const lastOne = await tr
      .selectFrom("alignmentReport")
      .selectAll()
      .where("bookUuid", "=", input.bookUuid)
      .orderBy("createdAt", "desc")
      .orderBy(sql`rowid`, "desc")
      .limit(1)
      .executeTakeFirst()

    const inserted = await tr
      .insertInto("alignmentReport")
      .values({
        jobUuid: input.jobUuid,
        bookUuid: input.bookUuid,
        report: JSON.stringify(report),
        ...summaryColumns(s),
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    if (input.bookUuid) {
      await tr
        .updateTable("alignmentReport")
        .set({ report: null })
        .where("bookUuid", "=", input.bookUuid)
        .where("uuid", "!=", inserted.uuid)

        .$if(!!lastOne, (qb) =>
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          qb.where("uuid", "!=", lastOne!.uuid),
        )
        .execute()
    }

    return inserted
  })

  return { report: row, summary: s }
}

export async function getAlignmentReportForBook(
  bookUuid: UUID,
  reportUuid?: UUID,
): Promise<AlignmentReport | null> {
  const row = await db
    .selectFrom("alignmentReport")
    .selectAll()
    .where("bookUuid", "=", bookUuid)
    .orderBy("createdAt", "desc")
    .orderBy(sql`rowid`, "desc")
    .$if(!!reportUuid, (qb) =>
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      qb.where("uuid", "=", reportUuid!),
    )
    .limit(1)
    .executeTakeFirst()

  return row ?? null
}

export async function listAlignmentReportSummaries(bookUuid: UUID) {
  return db
    .selectFrom("alignmentReport")
    .select([
      "uuid",
      "jobUuid",
      "createdAt",
      "grade",
      "score",
      "confidence",
      "sentenceCoverage",
      "audioCoverage",
      "chapters",
      "failedChapters",
      "unalignedAudio",
      sql<number>`report is not null`.as("hasReport"),
    ])
    .where("bookUuid", "=", bookUuid)
    .orderBy("createdAt", "desc")
    .orderBy(sql`rowid`, "desc")
    .execute()
}

export async function resummarizeLatestReport(
  bookUuid: UUID,
): Promise<AlignmentSummary | null> {
  const latest = await getAlignmentReportForBook(bookUuid)
  if (!latest?.report) return null
  const s = summarizeReport(
    latest.report,
    await getAlignmentDecisions(bookUuid),
    await getAudiobookDuration(bookUuid),
  )
  await db
    .updateTable("alignmentReport")
    .set(summaryColumns(s))
    .where("uuid", "=", latest.uuid)
    .execute()
  return s
}

export async function updateAlignmentDecisions(
  bookUuid: UUID,
  decisions: AlignmentDecisions,
): Promise<AlignmentDecisions> {
  const stored = await replaceAlignmentDecisions(bookUuid, decisions)
  await resummarizeLatestReport(bookUuid)
  return stored
}

export async function applyAlignmentOverrides(
  bookUuid: UUID,
  overrides: AlignmentOverrides,
): Promise<AlignmentDecisions> {
  const current = await getAlignmentDecisions(bookUuid)
  const incoming = overridesToDecisions(overrides)
  return updateAlignmentDecisions(bookUuid, {
    chapters: incoming.chapters,
    audio: [
      ...current.audio.filter(
        (exclusion) => exclusion.start !== null || exclusion.end !== null,
      ),
      ...incoming.audio,
    ],
  })
}

export async function recomputeAlignmentSummaries(
  bookUuids: UUID[] | null,
): Promise<number> {
  const rows = await db
    .selectFrom("alignmentReport")
    .leftJoin("audiobook", "audiobook.bookUuid", "alignmentReport.bookUuid")
    .select([
      "alignmentReport.uuid",
      "alignmentReport.bookUuid",
      "alignmentReport.report",
      "audiobook.duration",
    ])
    .where("alignmentReport.report", "is not", null)
    .$if(bookUuids !== null, (qb) =>
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      qb.where("alignmentReport.bookUuid", "in", bookUuids!),
    )
    .execute()

  let count = 0
  for (const row of rows) {
    if (!row.report) continue
    const decisions = row.bookUuid
      ? await getAlignmentDecisions(row.bookUuid)
      : null
    const s = summarizeReport(row.report, decisions, row.duration)
    await db
      .updateTable("alignmentReport")
      .set(summaryColumns(s))
      .where("uuid", "=", row.uuid)
      .execute()
    count++
  }

  const oldReports = await db
    .selectFrom("alignmentReport")
    .select([
      "uuid",
      "bookUuid",
      "confidence",
      "sentenceCoverage",
      "audioCoverage",
    ])
    .where("report", "is", null)
    .$if(bookUuids !== null, (qb) =>
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      qb.where("alignmentReport.bookUuid", "in", bookUuids!),
    )
    .execute()

  for (const report of oldReports) {
    const s = gradeForScore(report.sentenceCoverage, report.audioCoverage)

    await db
      .updateTable("alignmentReport")
      .set({
        grade: s.grade,
        score: s.score,
      })
      .where("uuid", "=", report.uuid)
      .execute()
    count++
  }

  return count
}

export async function getAlignmentFacets(): Promise<AlignmentFacets> {
  const gradeResult = await sql<{ grade: string; count: number }>`
    select grade, count(*) as count
    from (
      select grade,
             row_number() over (partition by book_uuid order by created_at desc) as rn
      from alignment_report
      where grade is not null
    )
    where rn = 1
    group by grade
  `.execute(db)

  const mutedResult = await sql<{ count: number }>`
    select count(*) as count
    from (
      select muted_chapters,
             row_number() over (partition by book_uuid order by created_at desc) as rn
      from alignment_report
      where grade is not null
    )
    where rn = 1 and muted_chapters > 0
  `.execute(db)

  const grades: Record<string, number> = {}
  let total = 0
  for (const row of gradeResult.rows) {
    if (!row.grade) continue
    grades[row.grade] = row.count
    total += row.count
  }

  return { grades, total, muted: mutedResult.rows[0]?.count ?? 0 }
}
