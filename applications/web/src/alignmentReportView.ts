import type z from "zod"

import {
  REPORT_VERSION,
  type ReportSpan,
  type ReportSpineItem,
  type ReportTrack,
  type ReportV3,
  type SpineStatus,
  assembleReport,
  emptyTotals,
  spanSentences,
} from "@storyteller-platform/align/report"

import { type AlignmentGrade } from "@/shelves"
import { type UUID } from "@/uuid"

import {
  type AlignmentReportJobSchemaV2,
  type AlignmentReportPreviousSchemaV2,
  type AlignmentReportSummarySchemaV2,
  type AlignmentReportViewSchemaV2,
  type Judgment,
  type ViewSpineItemSchemaV2,
  type ViewTrackSchemaV2,
} from "./schemas/v2/alignmentReport"

export type { Judgment, ReportSpan, ReportSpineItem, ReportTrack, ReportV3 }

export type ViewSpineItem = z.infer<typeof ViewSpineItemSchemaV2>

export type ViewTrack = z.infer<typeof ViewTrackSchemaV2>

export type AlignmentReportSummary = z.infer<
  typeof AlignmentReportSummarySchemaV2
>

export type BookAlignmentReportView = z.infer<
  typeof AlignmentReportViewSchemaV2
>

export type ReportJob = z.infer<typeof AlignmentReportJobSchemaV2>

export type PreviousReport = z.infer<typeof AlignmentReportPreviousSchemaV2>

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

export const GAP_SECONDS = 1

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
  //   S ≥ 98% audio and ≥ 95% ebook
  // - A ≥ 95% both
  // - B ≥ 90% both check book
  // - C ≥ 90% audio, < 90% text -- check both
  // - D
  // - F < 50% either -- probably not fit for readaloud or sync

  const score =
    sentenceScore * SENTENCE_WEIGHT + audioScore * (1 - SENTENCE_WEIGHT)

  if (sentenceScore >= 95 && audioScore >= 98) {
    return { grade: "S", band: 0, score }
  }
  if (sentenceScore >= 90 && audioScore >= 96) {
    return { grade: "A", band: 1, score }
  }
  if (sentenceScore < 90 && audioScore >= 96) {
    return { grade: "B", band: 2, score }
  }
  if (sentenceScore >= 90 && audioScore < 96) {
    return { grade: "C", band: 3, score }
  }

  if (sentenceScore <= 50 && audioScore <= 50) {
    return { grade: "F", band: FAILING_BAND, score: 0 }
  }

  return { grade: "D", band: FAILING_BAND, score }

  // if(sentenceScore < 90 && audioScore < 90) {
  //   return { grade: "F", band: FAILING_BAND, score: 0 }
  // }

  // const gradesWithoutS = GRADE_BANDS.slice(1)

  // const band = gradesWithoutS.findIndex(({ min }) => score >= min)
  // const entry = gradesWithoutS[band]
  // if (!entry) {
  //   return { grade: "F", band: FAILING_BAND, score: 0 }
  // }
  // return { grade: entry.grade, band: band + 1, score }
}

type LegacyContext = {
  prevSentence: string | null
  matchedSentence: string
  nextSentence: string | null
}

type LegacyAudioSpan = { filepath: string; start: number; end: number }

export type LegacyChapter = {
  href: string
  spineIndex?: number
  chunk?: number
  score?: number
  firstMatchedSentenceId: number
  lastMatchedSentenceId: number
  firstMatchedSentenceContext: LegacyContext
  lastMatchedSentenceContext: LegacyContext
  chapterSentenceCount: number
  alignedSentenceCount: number
  audioFiles: LegacyAudioSpan[]
}

export type LegacyUnalignedChapter = {
  href: string
  reason: SpineStatus
  spineIndex?: number
  chapterSentenceCount?: number
  start?: string
  end?: string
}

export type LegacyAudioFile = {
  filepath: string
  duration?: number | null
  transcription?: { text: string } | null
}

export type LegacyReport = {
  chapters: LegacyChapter[]
  unalignedChapters?: LegacyUnalignedChapter[]
  audioFiles?: LegacyAudioFile[]
  unalignedAudioFiles?: LegacyAudioFile[]
}

export type AnyReport = ReportV3 | LegacyReport

export function isReportV3(report: AnyReport): report is ReportV3 {
  return (report as { version?: unknown }).version === REPORT_VERSION
}

export function fileName(path: string): string {
  return path.split("/").pop() ?? path
}

export function stem(path: string): string {
  return fileName(path).replace(/\.[^.]+$/, "")
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function legacyScore(chapter: LegacyChapter): number | null {
  if (typeof chapter.score === "number" && Number.isFinite(chapter.score)) {
    return round(Math.min(Math.max(chapter.score, 0), 100))
  }
  return null
}

type MergedLegacyChapter = {
  href: string
  spineIndex: number | null
  score: number | null
  scoreWeight: number
  sentenceCount: number
  alignedSentenceCount: number
  firstSentence: number
  lastSentence: number
  firstMatch: LegacyContext
  lastMatch: LegacyContext
  hulls: LegacyAudioSpan[]
}

function mergeLegacyChapters(chapters: LegacyChapter[]): MergedLegacyChapter[] {
  const merged: MergedLegacyChapter[] = []
  const byHref = new Map<string, MergedLegacyChapter>()

  for (const chapter of chapters) {
    const score = legacyScore(chapter)
    const existing = byHref.get(chapter.href)
    if (!existing) {
      const entry: MergedLegacyChapter = {
        href: chapter.href,
        spineIndex:
          typeof chapter.spineIndex === "number" ? chapter.spineIndex : null,
        score,
        scoreWeight: chapter.chapterSentenceCount,
        sentenceCount: chapter.chapterSentenceCount,
        alignedSentenceCount: chapter.alignedSentenceCount,
        firstSentence: chapter.firstMatchedSentenceId,
        lastSentence: chapter.lastMatchedSentenceId,
        firstMatch: chapter.firstMatchedSentenceContext,
        lastMatch: chapter.lastMatchedSentenceContext,
        hulls: [],
      }
      for (const span of chapter.audioFiles) mergeHull(entry.hulls, span)
      byHref.set(chapter.href, entry)
      merged.push(entry)
      continue
    }

    if (score !== null) {
      const weight = chapter.chapterSentenceCount || 1
      existing.score =
        existing.score === null
          ? score
          : (existing.score * existing.scoreWeight + score * weight) /
            (existing.scoreWeight + weight)
      existing.scoreWeight += weight
    }
    existing.sentenceCount += chapter.chapterSentenceCount
    existing.alignedSentenceCount += chapter.alignedSentenceCount
    if (chapter.alignedSentenceCount > 0) {
      existing.firstSentence = Math.min(
        existing.firstSentence,
        chapter.firstMatchedSentenceId,
      )
      existing.lastSentence = Math.max(
        existing.lastSentence,
        chapter.lastMatchedSentenceId,
      )
      existing.lastMatch = chapter.lastMatchedSentenceContext
    }
    for (const span of chapter.audioFiles) mergeHull(existing.hulls, span)
  }

  return merged
}

function mergeHull(hulls: LegacyAudioSpan[], span: LegacyAudioSpan) {
  if (!span.filepath) return
  const existing = hulls.find((hull) => hull.filepath === span.filepath)
  if (existing) {
    existing.start = Math.min(existing.start, span.start)
    existing.end = Math.max(existing.end, span.end)
  } else {
    hulls.push({ ...span })
  }
}

export function fromLegacyReport(report: LegacyReport): ReportV3 {
  const merged = mergeLegacyChapters(report.chapters)
  const aligner: ReportV3["aligner"] = report.chapters.some(
    (chapter) => "chunk" in chapter,
  )
    ? "ctc"
    : "classic"

  const durations = new Map<string, number>()
  const noteDuration = (name: string, duration: number | null | undefined) => {
    const known = durations.get(name) ?? 0
    if (typeof duration === "number" && duration > known) {
      durations.set(name, duration)
    } else if (!durations.has(name)) {
      durations.set(name, known)
    }
  }
  for (const file of report.audioFiles ?? []) {
    noteDuration(fileName(file.filepath), file.duration)
  }
  for (const file of report.unalignedAudioFiles ?? []) {
    noteDuration(fileName(file.filepath), file.duration)
  }
  for (const chapter of merged) {
    for (const hull of chapter.hulls) {
      noteDuration(fileName(hull.filepath), hull.end)
    }
  }

  const trackNames = [...durations.keys()].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  )
  const trackIndex = new Map(trackNames.map((name, index) => [name, index]))

  let offset = 0
  const tracks = trackNames.map((name, index) => {
    const duration = durations.get(name) ?? 0
    const track = { index, name, duration, offset, source: null }
    offset += duration
    return track
  })

  const spineByHref = new Map<
    string,
    Parameters<typeof assembleReport>[0]["spine"][number]
  >()
  const spans: ReportSpan[] = []
  let syntheticIndex = -1
  const indexFor = (spineIndex: number | null) => spineIndex ?? syntheticIndex--

  const legacyCounts = new Map<
    number,
    { matched: number; interpolated: number }
  >()
  const legacyScores = new Map<number, number>()

  for (const chapter of merged) {
    const index = indexFor(chapter.spineIndex)
    const matched = chapter.alignedSentenceCount > 0
    if (chapter.score !== null) legacyScores.set(index, round(chapter.score))
    spineByHref.set(chapter.href, {
      index,
      href: chapter.href,
      title: null,
      status: matched ? "aligned" : "not-found",
      sentenceCount: chapter.sentenceCount,
      firstMatch: matched ? chapter.firstMatch : null,
      lastMatch: matched ? chapter.lastMatch : null,
      preview: null,
    })

    if (!matched || chapter.sentenceCount === 0) {
      if (chapter.sentenceCount > 0) {
        spans.push({
          spine: index,
          firstSentence: 0,
          lastSentence: chapter.sentenceCount - 1,
          state: "unmatched",
          audio: null,
        })
      }
      continue
    }

    const first = Math.max(0, chapter.firstSentence)
    const last = Math.min(chapter.sentenceCount - 1, chapter.lastSentence)
    const run = last - first + 1

    if (first > 0) {
      spans.push({
        spine: index,
        firstSentence: 0,
        lastSentence: first - 1,
        state: "unmatched",
        audio: null,
      })
    }

    const hulls = chapter.hulls
      .filter((hull) => trackIndex.has(fileName(hull.filepath)))
      .toSorted(
        (a, b) =>
          (trackIndex.get(fileName(a.filepath)) ?? 0) -
          (trackIndex.get(fileName(b.filepath)) ?? 0),
      )
    const totalSeconds = hulls.reduce(
      (sum, hull) => sum + Math.max(hull.end - hull.start, 0),
      0,
    )

    let cursor = first
    for (const [i, hull] of hulls.entries()) {
      const share =
        i === hulls.length - 1
          ? last - cursor + 1
          : totalSeconds > 0
            ? Math.round((run * (hull.end - hull.start)) / totalSeconds)
            : Math.round(run / hulls.length)
      const count = Math.max(0, Math.min(share, last - cursor + 1))
      if (count === 0) continue
      spans.push({
        spine: index,
        firstSentence: cursor,
        lastSentence: cursor + count - 1,
        state: "aligned",
        audio: {
          track: trackIndex.get(fileName(hull.filepath)) ?? 0,
          start: hull.start,
          end: hull.end,
        },
        score: chapter.score,
      })
      cursor += count
    }

    if (hulls.length === 0) {
      spans.push({
        spine: index,
        firstSentence: first,
        lastSentence: last,
        state: "unmatched",
        audio: null,
      })
    }

    if (last < chapter.sentenceCount - 1) {
      spans.push({
        spine: index,
        firstSentence: last + 1,
        lastSentence: chapter.sentenceCount - 1,
        state: "unmatched",
        audio: null,
      })
    }

    if (hulls.length > 0) {
      const matchedCount = Math.min(chapter.alignedSentenceCount, run)
      legacyCounts.set(index, {
        matched: matchedCount,
        interpolated: run - matchedCount,
      })
    }
  }

  for (const chapter of report.unalignedChapters ?? []) {
    const sentences = chapter.chapterSentenceCount ?? 0
    const found = spineByHref.get(chapter.href)
    if (found) {
      found.sentenceCount += sentences
      continue
    }
    const index = indexFor(
      typeof chapter.spineIndex === "number" ? chapter.spineIndex : null,
    )
    spineByHref.set(chapter.href, {
      index,
      href: chapter.href,
      title: null,
      status: chapter.reason,
      sentenceCount: sentences,
      firstMatch: null,
      lastMatch: null,
      preview:
        chapter.reason === "not-found" && chapter.start
          ? chapter.start.replace(/\s+/g, " ").trim().slice(0, 160) || null
          : null,
    })
    if (sentences > 0) {
      spans.push({
        spine: index,
        firstSentence: 0,
        lastSentence: sentences - 1,
        state: "unmatched",
        audio: null,
      })
    }
  }

  const spine = [...spineByHref.values()]
  const assembled = assembleReport({ aligner, spine, tracks, spans })

  for (const item of assembled.spine) {
    const score = legacyScores.get(item.index)
    if (score !== undefined) item.score = score
    const counts = legacyCounts.get(item.index)
    if (!counts) continue
    item.matchedSentenceCount = counts.matched
    item.interpolatedSentenceCount = counts.interpolated
  }

  return { ...assembled, totals: recountTotals(assembled) }
}

function recountTotals(report: ReportV3): ReportV3["totals"] {
  const totals = emptyTotals()
  for (const item of report.spine) {
    totals.spine[item.status]++
    totals.sentences += item.sentenceCount
    totals.matchedSentences += item.matchedSentenceCount
    totals.interpolatedSentences += item.interpolatedSentenceCount
    totals.droppedSentences += item.droppedSentenceCount
  }
  totals.unmatchedSentences =
    totals.sentences -
    totals.matchedSentences -
    totals.interpolatedSentences -
    totals.droppedSentences
  for (const track of report.tracks) {
    totals.seconds += track.duration
    totals.matchedSeconds += track.matchedSeconds
    totals.interpolatedSeconds += track.interpolatedSeconds
    totals.looseSeconds += track.looseSeconds
    totals.tracks++
    if (track.matchedSeconds === 0 && track.interpolatedSeconds === 0) {
      totals.unalignedTracks++
    }
  }
  return totals
}

export function normalizeReport(report: AnyReport): ReportV3 {
  return isReportV3(report) ? report : fromLegacyReport(report)
}

type TocEntry = { href?: string; title?: string; children?: TocEntry[] }

export type ManifestLike = {
  readingOrder?: { href?: string; title?: string }[]
  toc?: TocEntry[]
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

export function chapterJudgment(
  override: AlignmentChapterOverride | undefined,
): Judgment | null {
  if (!override) return null
  if (override.judgment !== undefined) return override.judgment
  return override.ignored ? "excluded" : null
}

export function audioExcluded(
  override: AlignmentAudioOverride | undefined,
): boolean {
  return override?.excluded ?? override?.ignored ?? false
}

export function itemJudgment(
  overrides: AlignmentOverrides | null | undefined,
  href: string,
): Judgment | null {
  return chapterJudgment(
    overrides?.chapters?.[href] ?? overrides?.unalignedChapters?.[href],
  )
}

export function hasText(status: SpineStatus): boolean {
  return status === "aligned" || status === "not-found"
}

export function creditedSentences(
  item: ReportSpineItem,
  spans: ReportSpan[],
): number {
  let credited = item.matchedSentenceCount
  for (const span of spans) {
    if (
      span.spine === item.index &&
      span.state === "interpolated" &&
      spanSentences(span) === 1
    ) {
      credited += 1
    }
  }
  return credited
}

export function summarizeReport(
  report: ReportV3,
  overrides?: AlignmentOverrides | null,
  audiobookDuration?: number | null,
): AlignmentReportSummary {
  let sentencesMatched = 0
  let sentencesTotal = 0
  let weightedConfidence = 0
  let confidenceWeight = 0
  let chapters = 0
  let approved = 0
  let excluded = 0
  let failed = 0

  const spansBySpine = new Map<number, ReportSpan[]>()
  for (const span of report.spans) {
    const list = spansBySpine.get(span.spine) ?? []
    list.push(span)
    spansBySpine.set(span.spine, list)
  }

  for (const item of report.spine) {
    if (!hasText(item.status)) continue
    chapters += 1
    const judgment = itemJudgment(overrides, item.href)
    if (judgment === "approved") approved += 1
    if (judgment === "excluded") {
      excluded += 1
      continue
    }
    const credited = creditedSentences(item, spansBySpine.get(item.index) ?? [])
    const counted = judgment === "approved" ? credited : item.sentenceCount
    const confidence =
      judgment === "approved" ? 100 : item.score === null ? 0 : item.score
    sentencesMatched += credited
    sentencesTotal += counted
    weightedConfidence += confidence * counted
    confidenceWeight += counted
    if (item.sentenceCount > 0 && item.matchedSentenceCount === 0) failed += 1
  }

  let audioPlacedSeconds = 0
  let audioTotalSeconds = 0
  let excludedSeconds = 0
  let looseAudio = 0
  let looseSeconds = 0
  for (const track of report.tracks) {
    if (audioExcluded(overrides?.audioFiles?.[track.name])) {
      excludedSeconds += track.duration
      continue
    }
    const placed = track.matchedSeconds + track.interpolatedSeconds
    audioPlacedSeconds += placed
    audioTotalSeconds += track.duration
    const loose = track.duration - placed
    if (loose >= GAP_SECONDS) {
      looseAudio += 1
      looseSeconds += loose
    }
  }

  if (typeof audiobookDuration === "number" && audiobookDuration > 0) {
    audioTotalSeconds = Math.max(
      audiobookDuration - excludedSeconds,
      audioPlacedSeconds,
    )
    looseSeconds = audioTotalSeconds - audioPlacedSeconds
  }

  const sentenceCoverage =
    sentencesTotal > 0
      ? round(Math.min((sentencesMatched / sentencesTotal) * 100, 100))
      : null
  const audioCoverage =
    audioTotalSeconds > 0
      ? round(Math.min((audioPlacedSeconds / audioTotalSeconds) * 100, 100))
      : null

  return {
    ...gradeForScore(sentenceCoverage, audioCoverage),
    confidence:
      confidenceWeight > 0
        ? round(weightedConfidence / confidenceWeight)
        : null,
    sentenceCoverage,
    audioCoverage,
    sentencesMatched,
    sentencesTotal,
    audioPlacedSeconds: round(audioPlacedSeconds, 3),
    audioTotalSeconds: round(audioTotalSeconds, 3),
    chapters,
    approved,
    excluded,
    failed,
    looseAudio,
    looseSeconds: round(looseSeconds, 3),
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
  latest: boolean
  previous?: PreviousReport | null
  overrides?: AlignmentOverrides | null
  ebookManifest?: ManifestLike | null
  audiobookDuration?: number | null
}): BookAlignmentReportView {
  const report = normalizeReport(args.report)
  const { titles, readHrefs } = indexManifest(args.ebookManifest)

  const items: ViewSpineItem[] = report.spine.map((item) => {
    const key = stem(item.href).toLowerCase()
    const title = item.title ?? titles.get(key) ?? null
    return {
      ...item,
      title,
      label: title ?? stem(item.href),
      readHref: readHrefs.get(key) ?? null,
      judgment: itemJudgment(args.overrides, item.href),
    }
  })

  const tracks: ViewTrack[] = report.tracks.map((track) => ({
    ...track,
    excluded: audioExcluded(args.overrides?.audioFiles?.[track.name]),
  }))

  return {
    bookUuid: args.bookUuid,
    bookTitle: args.bookTitle,
    reportUuid: args.reportUuid,
    jobUuid: args.jobUuid,
    job: args.job ?? null,
    createdAt: args.createdAt,
    latest: args.latest,
    previous: args.previous ?? null,
    aligner: report.aligner,
    summary: summarizeReport(report, args.overrides, args.audiobookDuration),
    items,
    tracks,
    spans: report.spans,
    holes: report.holes,
    totals: report.totals,
  }
}
