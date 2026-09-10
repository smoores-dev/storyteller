import { type Selectable, sql } from "kysely"

import {
  type AlignmentAudioOverride,
  type AlignmentChapterOverride,
  type AlignmentFacets,
  type AlignmentOverrides,
  type AnyReport,
  type LegacyReport,
  type ReportV3,
  normalizeReport,
  summarizeReport as summarizeReportView,
} from "@/alignmentReportView"
import { type AlignmentGrade } from "@/shelves"
import type { UUID } from "@/uuid"

import { db } from "./connection"
import { type DB } from "./schema"

export type {
  AlignmentAudioOverride,
  AlignmentChapterOverride,
  AlignmentOverrides,
  AnyReport,
  LegacyReport,
  ReportV3,
}

export interface AlignmentSummary {
  grade: AlignmentGrade
  band: number
  score: number | null
  confidence: number | null
  sentenceCoverage: number | null
  audioCoverage: number | null
  chapters: number
  missingSentences: number
  mutedChapters: number
  failedChapters: number
  unalignedAudio: number
}

export function summarizeReport(
  report: AnyReport,
  overrides?: AlignmentOverrides | null,
  audiobookDuration?: number | null,
): AlignmentSummary {
  const normalized = normalizeReport(report)
  const summary = summarizeReportView(normalized, overrides, audiobookDuration)

  let mutedChapters = 0
  for (const item of normalized.spine) {
    if (item.status !== "aligned") continue
    const override =
      overrides?.chapters?.[item.href] ??
      overrides?.unalignedChapters?.[item.href]
    if (override?.judgment === "excluded" || override?.ignored) continue
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
    failedChapters: summary.failed,
    unalignedAudio: summary.looseAudio,
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
}): Promise<AlignmentReport> {
  const report = normalizeReport(input.report)
  const s = summarizeReport(
    report,
    null,
    await getAudiobookDuration(input.bookUuid),
  )

  const row = await db.transaction().execute(async (tr) => {
    const inserted = await tr
      .insertInto("alignmentReport")
      .values({
        jobUuid: input.jobUuid,
        bookUuid: input.bookUuid,
        report: JSON.stringify(report),
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
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    if (input.bookUuid) {
      await tr
        .updateTable("alignmentReport")
        .set({ report: null })
        .where("bookUuid", "=", input.bookUuid)
        .where("uuid", "!=", inserted.uuid)
        .execute()
    }

    return inserted
  })

  return row
}

export async function getAlignmentReportForBook(
  bookUuid: UUID,
): Promise<AlignmentReport | null> {
  const row = await db
    .selectFrom("alignmentReport")
    .selectAll()
    .where("bookUuid", "=", bookUuid)
    .orderBy("createdAt", "desc")
    .orderBy(sql`rowid`, "desc")
    .limit(1)
    .executeTakeFirst()

  return row ?? null
}

export async function updateAlignmentOverrides(
  reportUuid: UUID,
  overrides: AlignmentOverrides,
): Promise<AlignmentReport> {
  const existing = await db
    .selectFrom("alignmentReport")
    .selectAll()
    .where("uuid", "=", reportUuid)
    .executeTakeFirstOrThrow()

  if (!existing.report) {
    throw new Error(
      `Alignment report ${reportUuid} has been superseded and its payload pruned; overrides can only be set on the latest report`,
    )
  }

  const s = summarizeReport(
    existing.report,
    overrides,
    await getAudiobookDuration(existing.bookUuid),
  )

  const row = await db
    .updateTable("alignmentReport")
    .set({
      overrides: JSON.stringify(overrides),
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
    })
    .where("uuid", "=", reportUuid)
    .returningAll()
    .executeTakeFirstOrThrow()

  return row
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
