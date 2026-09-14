import type z from "zod"

import {
  type AlignmentDecisions,
  type AudioExclusion,
  type ChapterDecision,
  type ExclusionSignal,
  type ExclusionSource,
  chapterAligned,
  excludedByRule,
  spineZone,
} from "@storyteller-platform/align/exclusions"
import {
  REPORT_VERSION,
  type ReportClassification,
  type ReportSpan,
  type ReportSpineItem,
  type ReportTrack,
  type ReportV4,
  type SpineStatus,
  assembleReport,
  emptyTotals,
  spanSentences,
} from "@storyteller-platform/align/report"

import { ALIGNMENT_GRADES } from "@/fields"
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

export type {
  AlignmentDecisions,
  AudioExclusion,
  ChapterDecision,
  ExclusionSignal,
  ExclusionSource,
  Judgment,
  ReportClassification,
  ReportSpan,
  ReportSpineItem,
  ReportTrack,
  ReportV4,
}

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

export const NO_DECISIONS: AlignmentDecisions = { chapters: {}, audio: [] }

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

export function overridesToDecisions(
  overrides: AlignmentOverrides | null | undefined,
): AlignmentDecisions {
  const chapters = new Map<string, ChapterDecision>()
  for (const section of [overrides?.unalignedChapters, overrides?.chapters]) {
    for (const [href, override] of Object.entries(section ?? {})) {
      const judgment = chapterJudgment(override)
      if (judgment) chapters.set(href, judgment)
      else chapters.delete(href)
    }
  }
  const audio: AudioExclusion[] = []
  for (const [track, override] of Object.entries(overrides?.audioFiles ?? {})) {
    if (audioExcluded(override)) audio.push({ track, start: null, end: null })
  }
  return { chapters: Object.fromEntries(chapters), audio }
}

export interface AlignmentFacets {
  grades: Record<string, number>
  total: number
  muted: number
}

export const SENTENCE_WEIGHT = 0.7

export const GAP_SECONDS = 1

type Graded = { grade: AlignmentGrade; band: number; score: number }

function graded(grade: AlignmentGrade, score: number): Graded {
  return { grade, band: ALIGNMENT_GRADES.indexOf(grade), score }
}

export function gradeForScore(
  sentenceScore: number | null,
  audioScore: number | null,
): Graded {
  if (sentenceScore === null || audioScore === null) {
    return graded("F", 0)
  }
  //   S ≥ 98% audio and ≥ 95% ebook
  // - A ≥ 95% both
  // - B ≥ 90% both check book
  // - C ≥ 90% audio, < 90% text -- check both
  // - D
  // - F < 50% either -- probably not fit for readaloud or sync

  const score =
    sentenceScore * SENTENCE_WEIGHT + audioScore * (1 - SENTENCE_WEIGHT)

  if (sentenceScore >= 94.5 && audioScore >= 98.5) {
    return graded("S", score)
  }

  if (sentenceScore >= 89.5 && audioScore >= 96.5) {
    return graded("A", score)
  }

  if (audioScore >= 96.5 && sentenceScore < 89.5) {
    return graded("B", score)
  }

  if (sentenceScore >= 89.5 && audioScore < 96.5) {
    return graded("C", score)
  }

  if (sentenceScore <= 50 && audioScore <= 50) {
    return graded("F", 0)
  }
  return graded("D", score)
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

export type LegacyStatus = SpineStatus | "is-nav" | "no-text"

export type LegacyUnalignedChapter = {
  href: string
  reason: LegacyStatus
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

export type ReportV3 = Omit<
  ReportV4,
  "version" | "autoExclude" | "spine" | "tracks" | "totals"
> & {
  version: 3
  spine: (Omit<ReportSpineItem, "status" | "classification" | "decision"> & {
    status: LegacyStatus
  })[]
  tracks: Omit<ReportTrack, "excluded">[]
  totals: Omit<ReportV4["totals"], "spine"> & {
    spine: Record<LegacyStatus, number>
  }
}

export type AnyReport = ReportV4 | ReportV3 | LegacyReport

export function isReportV4(report: AnyReport): report is ReportV4 {
  return (report as { version?: unknown }).version === REPORT_VERSION
}

export function isReportV3(report: AnyReport): report is ReportV3 {
  return (report as { version?: unknown }).version === 3
}

export function mechanicalClassification(
  source: ExclusionSource,
  index: number,
  length: number,
): ReportClassification {
  const signal = {
    source,
    value: source === "no-text" ? "" : source,
    verdict: "exclude" as const,
  }
  return {
    zone: spineZone(Math.max(index, 0), length),
    verdict: "exclude",
    decidedBy: signal,
    signals: [signal],
  }
}

function upgradeStatus(
  status: LegacyStatus,
  index: number,
  length: number,
): Pick<ReportSpineItem, "status" | "classification"> {
  if (status === "is-nav") {
    return {
      status: "excluded",
      classification: mechanicalClassification("nav", index, length),
    }
  }
  if (status === "no-text") {
    return {
      status: "excluded",
      classification: mechanicalClassification("no-text", index, length),
    }
  }
  return { status, classification: null }
}

export function upgradeReportV3(report: ReportV3): ReportV4 {
  const length = report.spine.length
  const spine: ReportSpineItem[] = report.spine.map((item) => ({
    ...item,
    ...upgradeStatus(item.status, item.index, length),
    decision: null,
  }))
  const tracks: ReportTrack[] = report.tracks.map((track) => ({
    ...track,
    excluded: [],
  }))
  const upgraded: ReportV4 = {
    ...report,
    version: REPORT_VERSION,
    autoExclude: false,
    spine,
    tracks,
    totals: emptyTotals(),
  }
  return { ...upgraded, totals: recountTotals(upgraded) }
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

export function fromLegacyReport(report: LegacyReport): ReportV4 {
  const merged = mergeLegacyChapters(report.chapters)
  const aligner: ReportV4["aligner"] = report.chapters.some(
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
      classification: null,
      decision: null,
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

  const unaligned = report.unalignedChapters ?? []
  const spineLength = report.chapters.length + unaligned.length
  for (const chapter of unaligned) {
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
      ...upgradeStatus(chapter.reason, index, spineLength),
      decision: null,
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
  const assembled = assembleReport({
    aligner,
    autoExclude: false,
    spine,
    tracks,
    spans,
  })

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

function recountTotals(report: ReportV4): ReportV4["totals"] {
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

export function normalizeReport(report: AnyReport): ReportV4 {
  if (isReportV4(report)) return report
  if (isReportV3(report)) return upgradeReportV3(report)
  return fromLegacyReport(report)
}

type TocEntry = { href?: string; title?: string; children?: TocEntry[] }

export type ManifestLike = {
  readingOrder?: { href?: string; title?: string; type?: string }[]
  resources?: { href?: string; type?: string }[]
  toc?: TocEntry[]
}

function audioHrefs(
  manifest: ManifestLike | null | undefined,
): Map<string, string> {
  const hrefs = new Map<string, string>()
  for (const link of [
    ...(manifest?.readingOrder ?? []),
    ...(manifest?.resources ?? []),
  ]) {
    if (!link.href || !link.type?.startsWith("audio/")) continue
    const name = link.href.split("/").pop()
    if (name && !hrefs.has(name)) hrefs.set(name, link.href)
  }
  return hrefs
}

export type PlaybackSources = {
  readaloud: ManifestLike | null
  original: boolean
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

export function itemDecision(
  decisions: AlignmentDecisions | null | undefined,
  href: string,
): ChapterDecision | null {
  return decisions?.chapters[href] ?? null
}

export function hasText(status: SpineStatus): boolean {
  return status === "aligned" || status === "not-found"
}

export function wouldAlign(
  item: Pick<ReportSpineItem, "classification">,
  decision: ChapterDecision | null,
  autoExclude: boolean,
): boolean {
  if (!item.classification) return decision !== "excluded"
  return chapterAligned(item.classification, decision, autoExclude)
}

export function itemPending(
  item: Pick<ReportSpineItem, "status" | "classification">,
  decision: ChapterDecision | null,
  autoExclude: boolean,
): boolean {
  if (item.status === "audio-only") return false
  return (
    wouldAlign(item, decision, autoExclude) !== (item.status !== "excluded")
  )
}

export function mergeRanges(
  ranges: { start: number; end: number }[],
): { start: number; end: number }[] {
  const sorted = ranges
    .filter((range) => range.end > range.start)
    .toSorted((a, b) => a.start - b.start)
  const merged: { start: number; end: number }[] = []
  for (const range of sorted) {
    const last = merged.at(-1)
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end)
    } else {
      merged.push({ ...range })
    }
  }
  return merged
}

export function trackExcludedRanges(
  decisions: AlignmentDecisions | null | undefined,
  track: Pick<ReportTrack, "name" | "duration">,
): { start: number; end: number }[] {
  const ranges = (decisions?.audio ?? [])
    .filter((exclusion) => exclusion.track === track.name)
    .map((exclusion) => ({
      start: Math.max(0, exclusion.start ?? 0),
      end: Math.min(track.duration, exclusion.end ?? track.duration),
    }))
  return mergeRanges(ranges)
}

export function rangeSeconds(ranges: { start: number; end: number }[]): number {
  return ranges.reduce((sum, range) => sum + (range.end - range.start), 0)
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
  report: ReportV4,
  decisions?: AlignmentDecisions | null,
  audiobookDuration?: number | null,
): AlignmentReportSummary {
  let sentencesMatched = 0
  let sentencesTotal = 0
  let weightedConfidence = 0
  let confidenceWeight = 0
  let chapters = 0
  let approved = 0
  let excluded = 0
  let excludedByRuleCount = 0
  let review = 0
  let pending = 0
  let failed = 0

  const spansBySpine = new Map<number, ReportSpan[]>()
  for (const span of report.spans) {
    const list = spansBySpine.get(span.spine) ?? []
    list.push(span)
    spansBySpine.set(span.spine, list)
  }

  for (const item of report.spine) {
    const decision = itemDecision(decisions, item.href)
    if (itemPending(item, decision, report.autoExclude)) pending += 1
    if (item.status === "excluded") {
      if (decision === "excluded") excluded += 1
      else if (
        item.decision !== "excluded" &&
        excludedByRule(item.classification)
      ) {
        excludedByRuleCount += 1
      }
      continue
    }
    if (!hasText(item.status)) continue
    chapters += 1
    if (decision === "approved") approved += 1
    if (decision === "excluded") {
      excluded += 1
      continue
    }
    if (item.classification?.verdict === "review" && !decision) review += 1
    const credited = creditedSentences(item, spansBySpine.get(item.index) ?? [])
    const counted = decision === "approved" ? credited : item.sentenceCount
    const confidence =
      decision === "approved" ? 100 : item.score === null ? 0 : item.score
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
    const masked = rangeSeconds(trackExcludedRanges(decisions, track))
    if (masked >= track.duration) {
      excludedSeconds += track.duration
      continue
    }
    excludedSeconds += masked
    const placed = track.matchedSeconds + track.interpolatedSeconds
    const total = track.duration - masked
    audioPlacedSeconds += placed
    audioTotalSeconds += total
    const loose = total - placed
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
    excludedByRule: excludedByRuleCount,
    review,
    pending,
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
  playback: PlaybackSources
  previous?: PreviousReport | null
  decisions?: AlignmentDecisions | null
  ebookManifest?: ManifestLike | null
  audiobookDuration?: number | null
}): BookAlignmentReportView {
  const report = normalizeReport(args.report)
  const decisions = args.decisions ?? NO_DECISIONS
  const { titles, readHrefs } = indexManifest(args.ebookManifest)

  const items: ViewSpineItem[] = report.spine.map((item) => {
    const key = stem(item.href).toLowerCase()
    const title = item.title ?? titles.get(key) ?? null
    const judgment = itemDecision(decisions, item.href)
    return {
      ...item,
      title,
      label: title ?? stem(item.href),
      readHref: readHrefs.get(key) ?? null,
      judgment,
      pending: itemPending(item, judgment, report.autoExclude),
    }
  })

  const readaloudAudio = audioHrefs(args.playback.readaloud)
  const audioSource: BookAlignmentReportView["audioSource"] = args.playback
    .readaloud
    ? "readaloud"
    : args.playback.original
      ? "original"
      : "none"
  const tracks: ViewTrack[] = report.tracks.map((track) => {
    const excludedRanges = trackExcludedRanges(decisions, track)
    const readaloudHref = readaloudAudio.get(track.name) ?? null
    return {
      ...track,
      playback: readaloudHref
        ? "readaloud"
        : args.playback.original && track.source
          ? "original"
          : null,
      readaloudHref,
      excluded: rangeSeconds(excludedRanges) >= track.duration,
      excludedRanges,
    }
  })

  return {
    bookUuid: args.bookUuid,
    bookTitle: args.bookTitle,
    reportUuid: args.reportUuid,
    jobUuid: args.jobUuid,
    job: args.job ?? null,
    createdAt: args.createdAt,
    latest: args.latest,
    audioSource,
    previous: args.previous ?? null,
    aligner: report.aligner,
    autoExclude: report.autoExclude,
    decisions,
    summary: summarizeReport(report, decisions, args.audiobookDuration),
    items,
    tracks,
    spans: report.spans,
    holes: report.holes,
    totals: report.totals,
  }
}
