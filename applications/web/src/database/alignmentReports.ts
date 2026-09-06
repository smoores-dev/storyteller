import { type Selectable, sql } from "kysely"

import { type CtcReport, type Report } from "@storyteller-platform/align"

import {
  type AlignmentFacets,
  type Judgment,
  buildReportModel,
} from "@/alignmentReportView"
import { type AlignmentGrade } from "@/shelves"
import type { UUID } from "@/uuid"

import { db } from "./connection"
import { type DB } from "./schema"

export type { CtcReport, Report }

export type AnyReport = Report | CtcReport

type ChapterReport = AnyReport["chapters"][number]
type UnalignedChapterReport = AnyReport["unalignedChapters"][number]
type AudioFileReport = AnyReport["audioFiles"][number]
type UnalignedAudioFileReport = AnyReport["unalignedAudioFiles"][number]

export interface AlignmentSummary {
  grade: AlignmentGrade
  band: number
  score: number | null
  chapters: number
  missingSentences: number
  mutedChapters: number
  failedChapters: number
  unalignedAudio: number
}

export interface AlignmentChapterOverride {
  judgment?: Judgment | null
  ignored?: boolean
}

export interface AlignmentAudioOverride {
  excluded?: boolean
  ignored?: boolean
}

export interface AlignmentOverrides {
  chapters?: Record<string, AlignmentChapterOverride>
  unalignedChapters?: Record<string, AlignmentChapterOverride>
  audioFiles?: Record<string, AlignmentAudioOverride>
}

export function summarizeReport(
  report: {
    chapters: ChapterReport[]
    unalignedChapters?: UnalignedChapterReport[]
    audioFiles?: AudioFileReport[]
    unalignedAudioFiles?: UnalignedAudioFileReport[]
  },
  overrides?: AlignmentOverrides | null,
): AlignmentSummary {
  const { summary, items } = buildReportModel({ report, overrides })

  let failedChapters = 0
  for (const item of items) {
    if (item.judgment === "excluded") continue
    if (item.kind === "unaligned") {
      if (item.reason === "not-found") failedChapters += 1
      continue
    }
    if (item.chapterSentenceCount > 0 && item.alignedSentenceCount === 0) {
      failedChapters += 1
    }
  }

  return {
    grade: summary.grade,
    band: summary.band,
    score: summary.score,
    chapters: summary.chapters,
    missingSentences: summary.sentencesTotal - summary.sentencesAligned,
    mutedChapters: summary.noAudio,
    failedChapters,
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
  // null on old reports
  report: AnyReport | null
}

export async function createAlignmentReport(input: {
  jobUuid: UUID | null
  bookUuid: UUID | null
  report: AnyReport
}): Promise<AlignmentReport> {
  const s = summarizeReport(input.report)

  const row = await db.transaction().execute(async (tr) => {
    const inserted = await tr
      .insertInto("alignmentReport")
      .values({
        jobUuid: input.jobUuid,
        bookUuid: input.bookUuid,
        report: JSON.stringify(input.report),
        grade: s.grade,
        score: s.score,
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

  const s = summarizeReport(existing.report, overrides)

  const row = await db
    .updateTable("alignmentReport")
    .set({
      overrides: JSON.stringify(overrides),
      grade: s.grade,
      score: s.score,
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
