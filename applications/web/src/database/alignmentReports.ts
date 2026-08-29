import { type Selectable, sql } from "kysely"

import { type CtcReport, type Report } from "@storyteller-platform/align"

import {
  type AlignmentFacets,
  type MergedChapter,
  mergeChapterChunks,
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
  /* 0-100 */
  score: number | null
  chapters: number
  missingSentences: number
  mutedChapters: number
  failedChapters: number
  unalignedAudio: number
}

export interface AlignmentChapterOverride {
  excludeFromScore?: boolean
  markedOk?: boolean
}

export interface AlignmentOverrides {
  chapters?: Record<string, AlignmentChapterOverride>
  unalignedChapters?: Record<string, { intended?: boolean }>
  audioFiles?: Record<string, { excluded?: boolean }>
}

function chapterExcluded(
  href: string,
  overrides?: AlignmentOverrides,
): boolean {
  const o = overrides?.chapters?.[href]
  return !!(o?.excludeFromScore || o?.markedOk)
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
  const chapters = mergeChapterChunks(report.chapters)
  const scored = chapters.filter(
    (ch) => !chapterExcluded(ch.href, overrides ?? undefined),
  )

  let totalSents = 0
  let totalAligned = 0
  let missingSentences = 0
  for (const ch of scored) {
    const total = ch.chapterSentenceCount || 0
    if (total > 0) {
      const al = ch.alignedSentenceCount
      totalSents += total
      totalAligned += al
      missingSentences += Math.max(total - al, 0)
    }
  }
  const score =
    totalSents > 0 ? Math.round((totalAligned / totalSents) * 100) : null

  const mutedChapters = chapters.filter(
    (ch) =>
      !overrides?.chapters?.[ch.href]?.markedOk &&
      ch.audioFiles.length === 0 &&
      (ch.chapterSentenceCount || 0) > 2,
  ).length

  const notFound = (report.unalignedChapters ?? []).filter(
    (c) =>
      c.reason === "not-found" &&
      !overrides?.unalignedChapters?.[c.href]?.intended,
  ).length
  const noMatch = chapters.filter(
    (ch) =>
      !overrides?.chapters?.[ch.href]?.markedOk &&
      (ch.chapterSentenceCount || 0) > 0 &&
      ch.alignedSentenceCount === 0,
  ).length

  const unalignedAudio = (report.unalignedAudioFiles ?? []).filter(
    (uaf) => !overrides?.audioFiles?.[uaf.filepath]?.excluded,
  ).length

  return {
    grade: computeGrade(score, scored),
    score,
    chapters: chapters.length,
    missingSentences,
    mutedChapters,
    failedChapters: notFound + noMatch,
    unalignedAudio,
  }
}

function computeGrade(
  score: number | null,
  chapters: MergedChapter[],
): AlignmentGrade {
  if (chapters.length === 0) return "F"
  if (score == null || score < 80) return "F"
  if (score < 90) return "D"
  if (score < 95) return "C"
  if (score >= 99) return "A+"

  const sig = chapters.filter((ch) => {
    const cnt = ch.chapterSentenceCount || 0
    if (cnt === 0) return false
    const al = ch.alignedSentenceCount
    return cnt - al > 5 && (al / cnt) * 100 < 95
  }).length
  const severe = chapters.filter((ch) => {
    const cnt = ch.chapterSentenceCount || 0
    if (cnt === 0) return false
    const al = ch.alignedSentenceCount
    return cnt - al > 10 && (al / cnt) * 100 < 90
  }).length

  if (score >= 97) return sig >= 3 ? "A-" : "A"
  return severe >= 3 ? "B-" : "B"
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

function parseAlignmentReport(row: AlignmentReportRow): AlignmentReport {
  return { ...row }
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

  return parseAlignmentReport(row)
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

  return parseAlignmentReport(row)
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
