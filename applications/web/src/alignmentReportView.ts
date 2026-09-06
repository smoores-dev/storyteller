import type z from "zod"

import {
  type AlignmentOverrides,
  type AnyReport,
} from "@/database/alignmentReports"
import { type AlignmentGrade } from "@/shelves"
import { type UUID } from "@/uuid"

import {
  type AlignmentReportJobSchemaV2,
  type AlignmentReportSummarySchemaV2,
  type AlignmentReportViewSchemaV2,
  type Judgment,
  type ReportAudioChunkSchemaV2,
  type ReportAudioFileSchemaV2,
  type ReportChapterAudioSchemaV2,
  type ReportChapterItemSchemaV2,
  type ReportSpineItemSchemaV2,
  type ReportUnalignedItemSchemaV2,
  type SentenceContextSchemaV2,
} from "./schemas/v2/alignmentReport"

export type { Judgment }

export type MatchContext = z.infer<typeof SentenceContextSchemaV2>

export type ReportChapterAudio = z.infer<typeof ReportChapterAudioSchemaV2>

export type ReportChapterItem = z.infer<typeof ReportChapterItemSchemaV2>

export type ReportUnalignedItem = z.infer<typeof ReportUnalignedItemSchemaV2>

export type ReportSpineItem = z.infer<typeof ReportSpineItemSchemaV2>

export type ReportAudioChunk = z.infer<typeof ReportAudioChunkSchemaV2>

export type ReportAudioFile = z.infer<typeof ReportAudioFileSchemaV2>

export type AlignmentReportSummary = z.infer<
  typeof AlignmentReportSummarySchemaV2
>

export type BookAlignmentReportView = z.infer<
  typeof AlignmentReportViewSchemaV2
>

export type ReportJob = z.infer<typeof AlignmentReportJobSchemaV2>

export interface AlignmentFacets {
  grades: Record<string, number>
  total: number
  muted: number
}

export const GRADE_BANDS = [
  { min: 98, grade: "S" },
  { min: 96, grade: "A" },
  { min: 93, grade: "A-" },
  { min: 90, grade: "B" },
  { min: 85, grade: "B-" },
  { min: 80, grade: "C" },
  { min: 75, grade: "D" },
  { min: Number.NEGATIVE_INFINITY, grade: "F" },
] as const satisfies readonly { min: number; grade: AlignmentGrade }[]

const FAILING_BAND = GRADE_BANDS.length - 1

export const SENTENCE_WEIGHT = 0.7

const GAP_SECONDS = 1

export function gradeForScore(
  sentenceScore: number | null,
  audioScore: number | null,
): {
  grade: AlignmentGrade
  band: number
  score: number
} {
  if (sentenceScore === null || audioScore === null) {
    return { grade: "F", band: FAILING_BAND, score: 0 }
  }

  const score =
    sentenceScore * SENTENCE_WEIGHT + audioScore * (1 - SENTENCE_WEIGHT)

  if (sentenceScore >= 98 && audioScore >= 98) {
    return { grade: "S", band: 0, score }
  }

  const gradesWithoutS = GRADE_BANDS.slice(1)

  const band = gradesWithoutS.findIndex(({ min }) => score >= min)
  const entry = gradesWithoutS[band]
  if (!entry) {
    return { grade: "F", band: FAILING_BAND, score: 0 }
  }
  return { grade: entry.grade, band, score }
}

type TocEntry = { href?: string; title?: string; children?: TocEntry[] }

export type ManifestLike = {
  readingOrder?: { href?: string; title?: string }[]
  toc?: TocEntry[]
}

type RawChapter = AnyReport["chapters"][number]

type RawUnalignedChapter = AnyReport["unalignedChapters"][number]

type RawAudioFile = AnyReport["audioFiles"][number]

type RawUnalignedAudio = AnyReport["unalignedAudioFiles"][number]

export type ReportLike = {
  chapters: RawChapter[]
  unalignedChapters?: RawUnalignedChapter[]
  audioFiles?: RawAudioFile[]
  unalignedAudioFiles?: RawUnalignedAudio[]
}

type RawAudioSpan = { filepath: string; start: number; end: number }

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
  audioFiles: RawAudioSpan[]
}

export function fileName(path: string): string {
  return path.split("/").pop() ?? path
}

export function stem(path: string): string {
  return fileName(path).replace(/\.[^.]+$/, "")
}

function mergeAudioSpans(spans: RawAudioSpan[]): RawAudioSpan[] {
  const merged: RawAudioSpan[] = []
  for (const span of spans) {
    if (!span.filepath) continue
    const existing = merged.find((s) => s.filepath === span.filepath)
    if (existing) {
      existing.start = Math.min(existing.start, span.start)
      existing.end = Math.max(existing.end, span.end)
    } else {
      merged.push({ ...span })
    }
  }
  return merged
}

function chapterScore(chapter: RawChapter): number {
  if (typeof chapter.score === "number" && Number.isFinite(chapter.score)) {
    return Math.min(Math.max(chapter.score, 0), 100)
  }
  const count = chapter.chapterSentenceCount || 0
  return count > 0
    ? Math.min((chapter.alignedSentenceCount / count) * 100, 100)
    : 0
}

export function mergeChapterChunks(chapters: RawChapter[]): MergedChapter[] {
  const merged: MergedChapter[] = []
  const indexByHref = new Map<string, number>()

  for (const chapter of chapters) {
    const index = indexByHref.get(chapter.href)
    const existing = index === undefined ? undefined : merged[index]

    if (!existing) {
      indexByHref.set(chapter.href, merged.length)
      merged.push({
        href: chapter.href,
        spineIndex:
          typeof chapter.spineIndex === "number"
            ? chapter.spineIndex
            : merged.length,
        score: chapterScore(chapter),
        chapterSentenceCount: chapter.chapterSentenceCount,
        alignedSentenceCount: chapter.alignedSentenceCount,
        firstMatchedSentenceId: chapter.firstMatchedSentenceId,
        lastMatchedSentenceId: chapter.lastMatchedSentenceId,
        firstMatchedSentenceContext: chapter.firstMatchedSentenceContext,
        lastMatchedSentenceContext: chapter.lastMatchedSentenceContext,
        audioFiles: mergeAudioSpans(chapter.audioFiles),
      })
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
    existing.audioFiles = mergeAudioSpans([
      ...existing.audioFiles,
      ...chapter.audioFiles,
    ])
  }

  return merged
}

function indexManifest(manifest: ManifestLike | null | undefined): {
  titles: Map<string, string>
  readHrefs: Map<string, string>
} {
  const titles = new Map<string, string>()
  const readHrefs = new Map<string, string>()
  const visit = (entries: TocEntry[] | undefined) => {
    for (const entry of entries ?? []) {
      const key = entry.href ? stem(entry.href).toLowerCase() : null
      if (key && entry.title && !titles.has(key)) titles.set(key, entry.title)
      visit(entry.children)
    }
  }
  visit(manifest?.toc)
  for (const entry of manifest?.readingOrder ?? []) {
    const key = entry.href ? stem(entry.href).toLowerCase() : null
    if (!key || !entry.href) continue
    if (entry.title && !titles.has(key)) titles.set(key, entry.title)
    if (!readHrefs.has(key)) readHrefs.set(key, entry.href.split("#")[0] ?? "")
  }
  return { titles, readHrefs }
}

function chapterJudgment(
  override: { judgment?: Judgment | null; ignored?: boolean } | undefined,
): Judgment | null {
  if (!override) return null
  if (override.judgment !== undefined) return override.judgment
  return override.ignored ? "excluded" : null
}

function audioExcluded(
  override: { excluded?: boolean; ignored?: boolean } | undefined,
): boolean {
  return override?.excluded ?? override?.ignored ?? false
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

type PlacedRange = {
  start: number
  end: number
  href: string
  label: string
  placed: boolean
}

export function buildReportModel({
  report,
  overrides,
  ebookManifest,
}: {
  report: ReportLike
  overrides?: AlignmentOverrides | null
  ebookManifest?: ManifestLike | null
}): {
  summary: AlignmentReportSummary
  items: ReportSpineItem[]
  audioFiles: ReportAudioFile[]
} {
  const { titles, readHrefs } = indexManifest(ebookManifest)
  const titleFor = (href: string) =>
    titles.get(stem(href).toLowerCase()) ?? null
  const readHrefFor = (href: string) =>
    readHrefs.get(stem(href).toLowerCase()) ?? null

  const merged = mergeChapterChunks(report.chapters)

  const rangesByFile = new Map<string, PlacedRange[]>()

  const chapterItems: ReportChapterItem[] = merged.map((chapter) => {
    const title = titleFor(chapter.href)
    const label = title ?? stem(chapter.href)
    const judgment = chapterJudgment(overrides?.chapters?.[chapter.href])

    for (const span of chapter.audioFiles) {
      const name = fileName(span.filepath)
      const ranges = rangesByFile.get(name) ?? []
      ranges.push({
        start: span.start,
        end: span.end,
        href: chapter.href,
        label,
        placed: judgment !== "excluded",
      })
      rangesByFile.set(name, ranges)
    }

    return {
      kind: "chapter",
      href: chapter.href,
      spineIndex: chapter.spineIndex,
      label,
      title,
      readHref: readHrefFor(chapter.href),
      confidence: round(chapter.score),
      alignedSentenceCount: chapter.alignedSentenceCount,
      chapterSentenceCount: chapter.chapterSentenceCount,
      firstMatchedSentenceId: chapter.firstMatchedSentenceId,
      lastMatchedSentenceId: chapter.lastMatchedSentenceId,
      audioSeconds: chapter.audioFiles.reduce(
        (sum, span) => sum + (span.end - span.start),
        0,
      ),
      audio: [],
      judgment,
      firstMatch: chapter.firstMatchedSentenceContext,
      lastMatch: chapter.lastMatchedSentenceContext,
    }
  })

  for (const ranges of rangesByFile.values()) {
    ranges.sort((a, b) => a.start - b.start)
  }

  for (const [index, item] of chapterItems.entries()) {
    const chapter = merged[index]
    if (!chapter) continue
    item.audio = chapter.audioFiles.map((span) => {
      const name = fileName(span.filepath)
      return {
        name,
        start: span.start,
        end: span.end,
        duration: span.end - span.start,
        excluded: audioExcluded(overrides?.audioFiles?.[name]),
        sharedWith: (rangesByFile.get(name) ?? [])
          .filter((range) => range.href !== chapter.href)
          .map((range) => ({
            href: range.href,
            label: range.label,
            role: range.start < span.start ? "before" : "after",
          })),
      }
    })
  }

  const chapterByHref = new Map(chapterItems.map((item) => [item.href, item]))
  const unalignedByHref = new Map<string, ReportUnalignedItem>()
  for (const chapter of report.unalignedChapters ?? []) {
    const sentences =
      "chapterSentenceCount" in chapter ? chapter.chapterSentenceCount : null
    const found = chapterByHref.get(chapter.href)
    if (found) {
      found.chapterSentenceCount += sentences ?? 0
      continue
    }
    const existing = unalignedByHref.get(chapter.href)
    if (existing) {
      if (sentences !== null) {
        existing.chapterSentenceCount =
          (existing.chapterSentenceCount ?? 0) + sentences
      }
      continue
    }
    const title = titleFor(chapter.href)
    unalignedByHref.set(chapter.href, {
      kind: "unaligned",
      href: chapter.href,
      spineIndex: "spineIndex" in chapter ? chapter.spineIndex : null,
      label: title ?? stem(chapter.href),
      title,
      reason: chapter.reason,
      chapterSentenceCount: sentences,
      preview:
        chapter.reason === "not-found"
          ? chapter.start.replace(/\s+/g, " ").trim().slice(0, 160) || null
          : null,
      judgment: chapterJudgment(
        overrides?.unalignedChapters?.[chapter.href] ??
          overrides?.chapters?.[chapter.href],
      ),
    })
  }
  const unalignedItems = [...unalignedByHref.values()]

  const items: ReportSpineItem[] = [...chapterItems, ...unalignedItems]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const left = a.item.spineIndex
      const right = b.item.spineIndex
      if (left === null && right === null) return a.index - b.index
      if (left === null) return -1
      if (right === null) return 1
      return left - right || a.index - b.index
    })
    .map(({ item }) => item)

  const durations = new Map<string, number>()
  for (const file of [
    ...(report.audioFiles ?? []),
    ...(report.unalignedAudioFiles ?? []),
  ]) {
    const name = fileName(file.filepath)
    const duration: unknown = file.duration
    if (durations.has(name) || typeof duration !== "number") continue
    durations.set(name, duration)
  }
  for (const [name, ranges] of rangesByFile) {
    const end = ranges.reduce((max, range) => Math.max(max, range.end), 0)
    const known = durations.get(name)
    if (known === undefined || known <= 0) durations.set(name, end)
  }

  const audioFiles: ReportAudioFile[] = [...durations.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([name, duration]) => {
      const chunks: ReportAudioChunk[] = []
      let cursor = 0
      const gap = (end: number) => {
        if (end - cursor >= GAP_SECONDS) {
          chunks.push({
            start: cursor,
            end,
            duration: end - cursor,
            placed: false,
            href: null,
            label: null,
          })
        }
      }
      for (const range of rangesByFile.get(name) ?? []) {
        const start = Math.max(range.start, cursor)
        const end = Math.max(range.end, start)
        gap(start)
        chunks.push({
          start,
          end,
          duration: end - start,
          placed: range.placed,
          href: range.href,
          label: range.label,
        })
        cursor = end
      }
      gap(duration)
      return {
        name,
        duration,
        excluded: audioExcluded(overrides?.audioFiles?.[name]),
        placedSeconds: chunks.reduce(
          (sum, chunk) => sum + (chunk.placed ? chunk.duration : 0),
          0,
        ),
        chunks,
      }
    })

  let sentencesAligned = 0
  let sentencesTotal = 0
  let weightedConfidence = 0
  let confidenceWeight = 0

  for (const item of items) {
    if (item.judgment === "excluded") continue
    const total = item.chapterSentenceCount ?? 0
    const aligned = item.kind === "chapter" ? item.alignedSentenceCount : 0
    const counted = item.judgment === "approved" ? aligned : total
    const confidence =
      item.judgment === "approved"
        ? 100
        : item.kind === "chapter"
          ? item.confidence
          : 0
    sentencesAligned += aligned
    sentencesTotal += counted
    weightedConfidence += confidence * counted
    confidenceWeight += counted
  }

  let audioPlacedSeconds = 0
  let audioTotalSeconds = 0
  let looseAudio = 0
  let looseSeconds = 0
  for (const file of audioFiles) {
    if (file.excluded) continue
    audioPlacedSeconds += file.placedSeconds
    audioTotalSeconds += file.duration
    const loose = file.duration - file.placedSeconds
    if (loose >= GAP_SECONDS) {
      looseAudio += 1
      looseSeconds += loose
    }
  }

  const sentenceRatio =
    sentencesTotal > 0 ? round((sentencesAligned / sentencesTotal) * 100) : null
  const audioRatio =
    audioTotalSeconds > 0
      ? round((audioPlacedSeconds / audioTotalSeconds) * 100)
      : null

  return {
    summary: {
      ...gradeForScore(sentenceRatio, audioRatio),
      confidence:
        confidenceWeight > 0
          ? round(weightedConfidence / confidenceWeight)
          : null,
      sentencesAligned,
      sentencesTotal,
      audioPlacedSeconds,
      audioTotalSeconds,
      chapters: chapterItems.length,
      approved: items.filter((item) => item.judgment === "approved").length,
      excluded: items.filter((item) => item.judgment === "excluded").length,
      noAudio: chapterItems.filter(
        (item) => item.judgment !== "excluded" && item.audio.length === 0,
      ).length,
      looseAudio,
      looseSeconds,
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
  job?: ReportJob | null
  createdAt: string
  overrides?: AlignmentOverrides | null
  ebookManifest: ManifestLike | null
}): BookAlignmentReportView {
  return {
    bookUuid: args.bookUuid,
    bookTitle: args.bookTitle,
    reportUuid: args.reportUuid,
    jobUuid: args.jobUuid,
    job: args.job ?? null,
    createdAt: args.createdAt,
    ...buildReportModel(args),
  }
}
