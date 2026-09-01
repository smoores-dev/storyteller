import type z from "zod"

import {
  type AlignmentOverrides,
  type AnyReport,
} from "@/database/alignmentReports"
import { type AlignmentGrade } from "@/shelves"
import { type UUID } from "@/uuid"

import {
  type AlignmentReportSummarySchemaV2,
  type AlignmentReportViewSchemaV2,
  type ReportChapterAudioSchemaV2,
  type ReportChapterItemSchemaV2,
  type ReportRangeToneSchemaV2,
  type ReportSpineItemSchemaV2,
  type ReportStripFileSchemaV2,
  type ReportUnalignedItemSchemaV2,
  type SentenceContextSchemaV2,
} from "./schemas/v2/alignmentReport"

export type MatchContext = z.infer<typeof SentenceContextSchemaV2>

export type ReportRangeTone = z.infer<typeof ReportRangeToneSchemaV2>

export type ReportChapterAudio = z.infer<typeof ReportChapterAudioSchemaV2>

export type ReportChapterItem = z.infer<typeof ReportChapterItemSchemaV2>

export type ReportUnalignedItem = z.infer<typeof ReportUnalignedItemSchemaV2>

export type ReportSpineItem = z.infer<typeof ReportSpineItemSchemaV2>

export type ReportStripFile = z.infer<typeof ReportStripFileSchemaV2>

export type AlignmentReportSummary = z.infer<
  typeof AlignmentReportSummarySchemaV2
>

export type BookAlignmentReportView = z.infer<
  typeof AlignmentReportViewSchemaV2
>

export interface AlignmentFacets {
  grades: Record<string, number>
  total: number
  muted: number
}

export const GRADE_BANDS = [
  { min: 95, grade: "A" },
  { min: 90, grade: "A-" },
  { min: 85, grade: "B" },
  { min: 80, grade: "B-" },
  { min: 75, grade: "C" },
  { min: 70, grade: "D" },
  { min: Number.NEGATIVE_INFINITY, grade: "F" },
] as const satisfies readonly { min: number; grade: AlignmentGrade }[]

const FAILING_BAND = GRADE_BANDS.length - 1

const PROMO_PATTERN = /discover|praise|newsletter|sneak/i

export function gradeForScore(score: number | null): {
  grade: AlignmentGrade
  band: number
} {
  if (score === null) return { grade: "F", band: FAILING_BAND }
  const band = GRADE_BANDS.findIndex(({ min }) => score >= min)
  const entry = GRADE_BANDS[band]
  if (!entry) return { grade: "F", band: FAILING_BAND }
  return { grade: entry.grade, band }
}

type ManifestLike = {
  readingOrder?: { href?: string; title?: string; duration?: number }[]
  toc?: { href?: string; title?: string }[]
}

type RawChapter = AnyReport["chapters"][number]

type RawUnalignedChapter = AnyReport["unalignedChapters"][number]

type RawUnalignedAudio = AnyReport["unalignedAudioFiles"][number]

type RawAudioFile = AnyReport["audioFiles"][number]

export type ReportLike = {
  chapters: RawChapter[]
  unalignedChapters?: RawUnalignedChapter[]
  audioFiles?: RawAudioFile[]
  unalignedAudioFiles?: RawUnalignedAudio[]
}

type TranscriptionContext = { before: string; after: string }

export type MergedChapter = {
  href: string
  spineIndex: number
  score: number
  chapterSentenceCount: number
  alignedSentenceCount: number
  firstMatchedSentenceId: number
  lastMatchedSentenceId: number
  firstMatchedSentenceContext: MatchContext
  lastMatchedSentenceContext: MatchContext
  transcriptionContext?: TranscriptionContext
  endTranscriptionContext?: TranscriptionContext
  audioFiles: { filepath: string; start: number; end: number }[]
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function chapterScore(chapter: RawChapter): number {
  const raw: Partial<RawChapter> = chapter
  if (typeof raw.score === "number" && Number.isFinite(raw.score)) {
    return Math.min(Math.max(raw.score, 0), 100)
  }
  const count = chapter.chapterSentenceCount || 0
  return count > 0
    ? Math.min((chapter.alignedSentenceCount / count) * 100, 100)
    : 0
}

function mergeAudioFiles(
  files: { filepath: string; start: number; end: number }[],
): { filepath: string; start: number; end: number }[] {
  const merged: { filepath: string; start: number; end: number }[] = []
  for (const file of files) {
    if (!file.filepath) continue
    const existing = merged.find((f) => f.filepath === file.filepath)
    if (existing) {
      existing.start = Math.min(existing.start, file.start)
      existing.end = Math.max(existing.end, file.end)
    } else {
      merged.push({ ...file })
    }
  }
  return merged
}

function toMerged(chapter: RawChapter, fallbackIndex: number): MergedChapter {
  const raw: Partial<RawChapter> = chapter
  return {
    href: chapter.href,
    spineIndex:
      typeof raw.spineIndex === "number" ? raw.spineIndex : fallbackIndex,
    score: chapterScore(chapter),
    chapterSentenceCount: chapter.chapterSentenceCount,
    alignedSentenceCount: chapter.alignedSentenceCount,
    firstMatchedSentenceId: chapter.firstMatchedSentenceId,
    lastMatchedSentenceId: chapter.lastMatchedSentenceId,
    firstMatchedSentenceContext: chapter.firstMatchedSentenceContext,
    lastMatchedSentenceContext: chapter.lastMatchedSentenceContext,
    ...("transcriptionContext" in chapter && {
      transcriptionContext: chapter.transcriptionContext,
    }),
    ...("endTranscriptionContext" in chapter && {
      endTranscriptionContext: chapter.endTranscriptionContext,
    }),
    audioFiles: mergeAudioFiles(chapter.audioFiles),
  }
}

export function mergeChapterChunks(chapters: RawChapter[]): MergedChapter[] {
  const merged: MergedChapter[] = []
  const indexByHref = new Map<string, number>()

  for (const chapter of chapters) {
    const index = indexByHref.get(chapter.href)
    const existing = index === undefined ? undefined : merged[index]

    if (!existing) {
      indexByHref.set(chapter.href, merged.length)
      merged.push(toMerged(chapter, merged.length))
      continue
    }

    const score = chapterScore(chapter)
    const totalCount =
      existing.chapterSentenceCount + chapter.chapterSentenceCount
    existing.score =
      totalCount > 0
        ? (existing.score * existing.chapterSentenceCount +
            score * chapter.chapterSentenceCount) /
          totalCount
        : (existing.score + score) / 2
    existing.chapterSentenceCount += chapter.chapterSentenceCount
    existing.alignedSentenceCount += chapter.alignedSentenceCount
    existing.firstMatchedSentenceId = Math.min(
      existing.firstMatchedSentenceId,
      chapter.firstMatchedSentenceId,
    )
    existing.lastMatchedSentenceId = Math.max(
      existing.lastMatchedSentenceId,
      chapter.lastMatchedSentenceId,
    )
    existing.lastMatchedSentenceContext = chapter.lastMatchedSentenceContext
    if ("endTranscriptionContext" in chapter) {
      existing.endTranscriptionContext = chapter.endTranscriptionContext
    }
    existing.audioFiles = mergeAudioFiles([
      ...existing.audioFiles,
      ...chapter.audioFiles,
    ])
  }

  return merged
}

function fileName(path: string): string {
  return path.split("/").pop() ?? path
}

function stem(path: string): string {
  return fileName(path).replace(/\.[^.]+$/, "")
}

function baseKey(path: string): string {
  return stem(path).toLowerCase()
}

function chapterTitlesFromManifest(
  manifest: ManifestLike | null,
): Map<string, string> {
  const map = new Map<string, string>()
  const add = (href?: string, title?: string) => {
    if (!href || !title) return
    map.set(baseKey(href), title)
  }
  for (const item of manifest?.readingOrder ?? []) add(item.href, item.title)
  for (const item of manifest?.toc ?? []) add(item.href, item.title)
  return map
}

function audioDurationsFromManifest(
  manifest: ManifestLike | null,
): Map<string, number> {
  const map = new Map<string, number>()
  for (const item of manifest?.readingOrder ?? []) {
    if (!item.href || !item.duration) continue
    map.set(baseKey(item.href), item.duration)
  }
  return map
}

function rangeTone(score: number): ReportRangeTone {
  if (score >= 90) return "good"
  if (score >= 85) return "moderate"
  return "poor"
}

/**
 * Grade algo
 *
 * Count each non-ignored body chapter's aligned/total sentences
 * Weight them by the chapter's sentence count
 * Non-found chapters have a score of 0
 *
 */
export function buildReportModel(args: {
  report: ReportLike
  overrides?: AlignmentOverrides | null
  ebookManifest?: ManifestLike | null
  audiobookManifest?: ManifestLike | null
}): {
  summary: AlignmentReportSummary
  items: ReportSpineItem[]
  audioFiles: ReportStripFile[]
} {
  const overrides = args.overrides ?? null
  const chapterTitles = chapterTitlesFromManifest(args.ebookManifest ?? null)
  const manifestDurations = audioDurationsFromManifest(
    args.audiobookManifest ?? null,
  )

  const merged = mergeChapterChunks(args.report.chapters)

  const audioReadingOrderByFilepath = new Map<
    string,
    { href: string; title: string; duration: number }
  >()
  for (const item of args.audiobookManifest?.readingOrder ?? []) {
    if (!item.href || !item.duration) continue
    audioReadingOrderByFilepath.set(fileName(item.href), item)
  }

  const nrIgnoredChapters = Object.values(overrides?.chapters ?? {}).filter(
    (override) => override.ignored,
  ).length

  const audioTotalSeconds =
    args.audiobookManifest?.readingOrder?.reduce(
      (acc, item) => acc + (item.duration ?? 0),
      0,
    ) ?? 0

  const {
    sentencesAligned,
    sentencesTotal,
    audioPlacedSeconds,
    // audioTotalSeconds,
  } = merged.reduce(
    (acc, chapter) => {
      if (overrides?.chapters?.[chapter.href]?.ignored) {
        return acc
        //
      }

      acc.sentencesAligned += chapter.alignedSentenceCount
      acc.sentencesTotal += chapter.chapterSentenceCount
      acc.audioPlacedSeconds += chapter.audioFiles.reduce(
        (acc, file) => acc + file.end - file.start,
        0,
      )
      // acc.audioTotalSeconds += manifestDurations.get(chapter.href) ?? 0

      return acc
    },
    {
      sentencesAligned: 0,
      sentencesTotal: 0,
      audioPlacedSeconds: 0,
      // audioTotalSeconds: 0,
      bodyUnaligned: 0,
    },
  )

  const score = merged.reduce((acc, chapter) => {
    if (overrides?.chapters?.[chapter.href]?.ignored) {
      return acc
    }

    acc += chapter.score * (chapter.chapterSentenceCount / sentencesTotal)

    return acc
  }, 0)

  const items = [] as ReportSpineItem[]

  const rangesByFile = new Map<
    string,
    { href: string; label: string; start: number; end: number; score: number }[]
  >()

  const chapterLikes = [...merged, ...(args.report.unalignedChapters ?? [])]
    .map((chapter) => {
      if ("alignedSentenceCount" in chapter) {
        return { ...chapter, kind: "chapter" as const }
      } else {
        return {
          // stuff like TOC, cover,
          spineIndex: 0,
          ...chapter,
          kind: "unaligned" as const,
        }
      }
    })
    .sort((a, b) => a.spineIndex - b.spineIndex)

  for (const item of chapterLikes) {
    const href = item.href
    const ignored = !!overrides?.chapters?.[href]?.ignored

    if (item.kind === "chapter") {
      const chapter = item
      const needsLook =
        chapter.alignedSentenceCount / chapter.chapterSentenceCount < 0.9

      const title = chapterTitles.get(baseKey(chapter.href)) ?? null
      const label = title ?? stem(chapter.href)
      for (const af of chapter.audioFiles) {
        const ranges = rangesByFile.get(af.filepath) ?? []
        ranges.push({
          href: chapter.href,
          label,
          start: af.start,
          end: af.end,
          score: chapter.score,
        })
        rangesByFile.set(af.filepath, ranges)
      }

      const audioSeconds = chapter.audioFiles.reduce(
        (acc, af) => acc + (af.end - af.start),
        0,
      )

      const missingSentenceCount =
        chapter.chapterSentenceCount - chapter.alignedSentenceCount
      const status =
        chapter.audioFiles.length === 0 && chapter.chapterSentenceCount > 0
          ? "no-audio"
          : missingSentenceCount > 5 &&
              audioSeconds / chapter.chapterSentenceCount < 0.9
            ? "missing"
            : "ok"

      const durationSuspicious =
        chapter.chapterSentenceCount > 20 &&
        audioSeconds < 0.5 * chapter.chapterSentenceCount

      const chapterItem = {
        kind: "chapter",
        alignedSentenceCount: chapter.alignedSentenceCount,
        chapterSentenceCount: chapter.chapterSentenceCount,
        score: chapter.score,
        ignored,
        needsLook,
        href: chapter.href,
        title,
        label,
        firstMatch: chapter.firstMatchedSentenceContext,
        lastMatch: chapter.lastMatchedSentenceContext,
        spineIndex: chapter.spineIndex,
        status,
        audioSeconds,
        durationSuspicious,
        missing: chapter.chapterSentenceCount - chapter.alignedSentenceCount,
        audio: chapter.audioFiles.map((aud) => ({
          filepath: fileName(aud.filepath),
          start: aud.start,
          end: aud.end,
          seconds: aud.end - aud.start,
          name:
            audioReadingOrderByFilepath.get(fileName(aud.filepath))?.title ??
            fileName(aud.filepath),
          sharedWith: [],
        })),
      } satisfies ReportChapterItem

      items.push(chapterItem)
      continue
    }
    const missingChapter = item

    const title = chapterTitles.get(baseKey(missingChapter.href)) ?? null
    const label = title ?? stem(missingChapter.href)
    // no need to look for navs or too short chapters
    const needsLook = !ignored && missingChapter.reason === "not-found"

    const unalignedItem = {
      kind: "unaligned",
      href: missingChapter.href,
      reason: missingChapter.reason,
      chapterSentenceCount:
        "chapterSentenceCount" in missingChapter
          ? missingChapter.chapterSentenceCount
          : 0,
      ignored,
      needsLook,
      spineIndex: missingChapter.spineIndex,
      label,
      preview:
        "start" in missingChapter
          ? `${missingChapter.start.slice(0, 100)}...${missingChapter.end.slice(0, 100)}`
          : null,
    } satisfies ReportUnalignedItem

    items.push(unalignedItem)
  }

  const audioFiles = [] as ReportStripFile[]

  for (const item of args.report.unalignedAudioFiles ?? []) {
    const manifestItem = audioReadingOrderByFilepath.get(
      fileName(item.filepath),
    )
    if (!manifestItem) continue

    audioFiles.push({
      name: manifestItem?.title ?? fileName(item.filepath),
      filepath: fileName(item.filepath),
      placed: false,
      ignored: false,
      between: {
        before: "",
        after: "",
      },
      duration: manifestItem?.duration ?? null,
    })
  }

  return {
    summary: {
      ...gradeForScore(score),
      score,
      sentencesAligned,
      sentencesTotal,
      audioPlacedSeconds,
      audioTotalSeconds,
      needsLook: items.filter((item) => item.needsLook).length,
      ignored: items.filter((item) => item.ignored).length,
      notFoundBody: 0,
      noAudio: items.filter(
        (item) =>
          item.kind === "chapter" &&
          !item.ignored &&
          item.status === "no-audio",
      ).length,
      looseAudio: audioFiles.filter((file) => !file.placed && !file.ignored)
        .length,
      chapters: items.filter((item) => item.kind === "chapter").length,
    },
    items,
    audioFiles,
  }
}

export function buildReportView(args: {
  report: AnyReport
  bookUuid: UUID
  bookTitle: string | null
  reportUuid: UUID
  jobUuid: UUID | null
  createdAt: string
  overrides?: AlignmentOverrides | null
  ebookManifest: ManifestLike | null
  audiobookManifest: ManifestLike | null
}): BookAlignmentReportView {
  const model = buildReportModel(args)

  return {
    bookUuid: args.bookUuid,
    bookTitle: args.bookTitle,
    reportUuid: args.reportUuid,
    jobUuid: args.jobUuid,
    createdAt: args.createdAt,
    ...model,
  }
}
