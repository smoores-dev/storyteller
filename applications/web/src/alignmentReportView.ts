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

  const rangesByFile = new Map<
    string,
    { href: string; label: string; start: number; end: number; score: number }[]
  >()

  const chapterItems: ReportChapterItem[] = merged.map((ch) => {
    const title = chapterTitles.get(baseKey(ch.href)) ?? null
    const label = title ?? stem(ch.href)
    const count = ch.chapterSentenceCount || 0
    const missing = Math.max(count - ch.alignedSentenceCount, 0)
    const audioSeconds = ch.audioFiles.reduce(
      (acc, af) => acc + (af.end - af.start),
      0,
    )
    const durationSuspicious = count > 20 && audioSeconds < 0.5 * count
    const coverage = count > 0 ? ch.alignedSentenceCount / count : 1
    const ignored = overrides?.chapters?.[ch.href]?.ignored ?? false

    for (const af of ch.audioFiles) {
      const ranges = rangesByFile.get(af.filepath) ?? []
      ranges.push({
        href: ch.href,
        label,
        start: af.start,
        end: af.end,
        score: ch.score,
      })
      rangesByFile.set(af.filepath, ranges)
    }

    const status =
      ch.audioFiles.length === 0 && count > 0
        ? "no-audio"
        : missing > 5 && coverage < 0.95
          ? "missing"
          : durationSuspicious
            ? "range"
            : "ok"

    return {
      kind: "chapter",
      href: ch.href,
      spineIndex: ch.spineIndex,
      label,
      title,
      score: round1(ch.score),
      alignedSentenceCount: ch.alignedSentenceCount,
      chapterSentenceCount: count,
      missing,
      audio: [],
      audioSeconds,
      durationSuspicious,
      status,
      needsLook: !ignored && status !== "ok",
      ignored,
      firstMatch: ch.firstMatchedSentenceContext,
      lastMatch: ch.lastMatchedSentenceContext,
      ...(ch.transcriptionContext && {
        transcriptionContext: ch.transcriptionContext,
      }),
      ...(ch.endTranscriptionContext && {
        endTranscriptionContext: ch.endTranscriptionContext,
      }),
    }
  })

  for (const ranges of rangesByFile.values()) {
    ranges.sort((a, b) => a.start - b.start)
  }

  for (const [index, item] of chapterItems.entries()) {
    const ch = merged[index]
    if (!ch) continue
    item.audio = ch.audioFiles.map((af) => ({
      name: fileName(af.filepath),
      filepath: af.filepath,
      start: af.start,
      end: af.end,
      seconds: af.end - af.start,
      sharedWith: (rangesByFile.get(af.filepath) ?? [])
        .filter((range) => range.href !== ch.href)
        .map((range) => ({
          href: range.href,
          label: range.label,
          role: range.start < af.start ? "before" : "after",
        })),
    }))
  }

  const scored = chapterItems.filter((item) => !item.ignored)
  const spineIndexes = scored.map((item) => item.spineIndex)
  const firstSpine = spineIndexes.length > 0 ? Math.min(...spineIndexes) : null
  const lastSpine = spineIndexes.length > 0 ? Math.max(...spineIndexes) : null

  const unalignedItems: ReportUnalignedItem[] = (
    args.report.unalignedChapters ?? []
  ).map((uc: RawUnalignedChapter) => {
    const raw = uc as {
      spineIndex?: number
      chapterSentenceCount?: number
    }
    const spineIndex =
      typeof raw.spineIndex === "number" ? raw.spineIndex : null
    const chapterSentenceCount =
      typeof raw.chapterSentenceCount === "number"
        ? raw.chapterSentenceCount
        : null
    const label = chapterTitles.get(baseKey(uc.href)) ?? stem(uc.href)
    const ignored = overrides?.unalignedChapters?.[uc.href]?.ignored ?? false
    const inBody =
      spineIndex !== null &&
      firstSpine !== null &&
      lastSpine !== null &&
      spineIndex > firstSpine &&
      spineIndex < lastSpine

    const hint =
      chapterSentenceCount !== null &&
      chapterSentenceCount <= 3 &&
      /^part/i.test(label)
        ? "part-title"
        : PROMO_PATTERN.test(uc.href) || PROMO_PATTERN.test(label)
          ? "promo"
          : spineIndex !== null &&
              firstSpine !== null &&
              spineIndex < firstSpine
            ? "front-matter"
            : spineIndex !== null &&
                lastSpine !== null &&
                spineIndex > lastSpine
              ? "after-last-match"
              : null

    return {
      kind: "unaligned",
      href: uc.href,
      spineIndex,
      label,
      reason: uc.reason,
      chapterSentenceCount,
      preview:
        uc.reason === "not-found"
          ? uc.start.replace(/\s+/g, " ").trim().slice(0, 160) || null
          : null,
      inBody,
      hint,
      needsLook: !ignored && uc.reason === "not-found" && inBody,
      ignored,
    }
  })

  const items = [...chapterItems, ...unalignedItems]
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

  const durationsByPath = new Map<string, number | null>()
  for (const af of args.report.audioFiles ?? []) {
    durationsByPath.set(af.filepath, af.duration > 0 ? af.duration : null)
  }
  for (const uaf of args.report.unalignedAudioFiles ?? []) {
    const raw = uaf as { duration?: number | null }
    if (durationsByPath.has(uaf.filepath)) continue
    durationsByPath.set(
      uaf.filepath,
      typeof raw.duration === "number" ? raw.duration : null,
    )
  }
  for (const filepath of rangesByFile.keys()) {
    if (!durationsByPath.has(filepath)) durationsByPath.set(filepath, null)
  }

  const audioFiles: ReportStripFile[] = [...durationsByPath.entries()]
    .map(([filepath, duration]) => {
      const ranges = (rangesByFile.get(filepath) ?? []).map((range) => ({
        start: range.start,
        end: range.end,
        href: range.href,
        label: range.label,
        tone: rangeTone(range.score),
      }))
      return {
        name: fileName(filepath),
        filepath: fileName(filepath),
        duration: duration ?? manifestDurations.get(baseKey(filepath)) ?? null,
        placed: ranges.length > 0,
        ignored: overrides?.audioFiles?.[filepath]?.ignored ?? false,
        ranges,
        between: { before: null, after: null },
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

  for (const [index, file] of audioFiles.entries()) {
    for (let before = index - 1; before >= 0; before--) {
      const last = audioFiles[before]?.ranges.at(-1)
      if (last) {
        file.between.before = last.label
        break
      }
    }
    for (let after = index + 1; after < audioFiles.length; after++) {
      const first = audioFiles[after]?.ranges[0]
      if (first) {
        file.between.after = first.label
        break
      }
    }
  }

  const bodyUnaligned = unalignedItems.filter(
    (item) => item.reason === "not-found" && item.inBody && !item.ignored,
  )

  let weighted = 0
  let weight = 0
  let sentencesAligned = 0
  let sentencesTotal = 0
  for (const item of scored) {
    weighted += item.score * item.chapterSentenceCount
    weight += item.chapterSentenceCount
    sentencesAligned += item.alignedSentenceCount
    sentencesTotal += item.chapterSentenceCount
  }
  for (const item of bodyUnaligned) {
    weight += item.chapterSentenceCount ?? 0
    sentencesTotal += item.chapterSentenceCount ?? 0
  }

  const score =
    scored.length > 0 && weight > 0 ? round1(weighted / weight) : null

  let audioPlacedSeconds = 0
  let audioTotalSeconds = 0
  for (const file of audioFiles) {
    for (const range of file.ranges) {
      audioPlacedSeconds += range.end - range.start
    }
    audioTotalSeconds += file.duration ?? 0
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
      notFoundBody: bodyUnaligned.length,
      noAudio: chapterItems.filter(
        (item) => !item.ignored && item.status === "no-audio",
      ).length,
      looseAudio: audioFiles.filter((file) => !file.placed && !file.ignored)
        .length,
      chapters: chapterItems.length,
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
