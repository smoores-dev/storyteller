import { type Clip } from "@v3/_/components/audio"

import {
  type ExclusionSignal,
  type Judgment,
  type ReportJob,
  type ReportSpan,
  type ViewSpineItem,
  type ViewTrack,
} from "@/alignmentReportView"
import { type AlignmentGrade } from "@/shelves"
import { type UUID } from "@/uuid"

export type Track = ViewTrack

export type ReportTone = "positive" | "good" | "moderate" | "poor" | "muted"

export const TONE_TEXT: Record<ReportTone, string> = {
  good: "text-good",
  positive: "text-positive",
  moderate: "text-moderate",
  poor: "text-poor",
  muted: "text-muted-foreground",
}

export const TONE_FILL: Record<ReportTone, string> = {
  good: "bg-good",
  positive: "bg-positive",
  moderate: "bg-moderate",
  poor: "bg-poor",
  muted: "bg-muted-foreground/40",
}

// export const TONE_STROKE: Record<ReportTone, string> = {
//   good: "stroke-good",
//   positive: "stroke-positive",
//   moderate: "stroke-moderate",
//   poor: "stroke-poor",
//   muted: "stroke-muted-foreground/40",
// }

export const TONE_BADGE: Record<ReportTone, string> = {
  good: "bg-good-bg text-good",
  positive: "bg-positive-bg text-positive",
  moderate: "bg-moderate-bg text-moderate",
  poor: "bg-poor-bg text-poor",
  muted: "bg-muted text-muted-foreground",
}

// export const TONE_TILE: Record<ReportTone, string> = {
//   good: "border-good-border bg-good-bg text-good",
//   positive: "border-positive-border bg-positive-bg text-positive",
//   moderate: "border-moderate-border bg-moderate-bg text-moderate",
//   poor: "border-poor-border bg-poor-bg text-poor",
//   muted: "border-border bg-muted text-foreground",
// }

export const GRADE_VERDICT = {
  S: "excellent",
  A: "strong",
  B: "good",
  C: "fair",
  D: "weak",
  F: "failed",
} as const satisfies Record<AlignmentGrade, string>

export const STRIPES =
  "bg-[repeating-linear-gradient(135deg,transparent_0_3px,var(--color-muted-foreground)_3px_5px)] opacity-40"

export const GAP = "border-poor/70 bg-poor/10 border border-dashed"

export const TRACK_PLACED_GOOD = 98

export type ToneLadder = { min: number; tone: ReportTone }[]

export const SENTENCE_LADDER: ToneLadder = [
  { min: 95, tone: "good" },
  { min: 90, tone: "positive" },
  { min: 80, tone: "moderate" },
  { min: 0, tone: "poor" },
]

export const AUDIO_LADDER: ToneLadder = [
  { min: 98, tone: "good" },
  { min: 96, tone: "positive" },
  { min: 90, tone: "moderate" },
  { min: 0, tone: "poor" },
]

export const CONFIDENCE_LADDER: ToneLadder = [
  { min: 90, tone: "good" },
  { min: 80, tone: "positive" },
  { min: 70, tone: "moderate" },
  { min: 0, tone: "poor" },
]

export function ladderTone(
  value: number | null,
  ladder: ToneLadder,
): ReportTone {
  if (value === null) return "muted"
  return ladder.find((step) => value >= step.min)?.tone ?? "poor"
}

export function percentTone(percent: number | null): ReportTone {
  return ladderTone(percent, SENTENCE_LADDER)
}

export function audioPercentTone(percent: number | null): ReportTone {
  return ladderTone(percent, AUDIO_LADDER)
}

export function confidenceTone(confidence: number | null): ReportTone {
  return ladderTone(confidence, CONFIDENCE_LADDER)
}

export function judgmentTone(judgment: Judgment | null): ReportTone | null {
  if (judgment === "approved") return "positive"
  if (judgment === "included") return "good"
  if (judgment === "excluded") return "muted"
  return null
}

const MECHANICAL_SOURCES = new Set<ExclusionSignal["source"]>([
  "linear",
  "nav",
  "media-type",
  "no-text",
])

export function ruleSignal(item: ViewSpineItem): ExclusionSignal | null {
  const decidedBy = item.classification?.decidedBy
  if (!decidedBy || MECHANICAL_SOURCES.has(decidedBy.source)) return null
  return decidedBy
}

export function skippedByRule(item: ViewSpineItem): boolean {
  return (
    item.status === "excluded" &&
    item.classification?.verdict === "exclude" &&
    ruleSignal(item) !== null
  )
}

export function needsListen(item: ViewSpineItem): boolean {
  return (
    item.judgment === null &&
    item.status !== "excluded" &&
    item.classification?.verdict === "review"
  )
}

export function rangeExcluded(
  track: ViewTrack,
  start: number,
  end: number,
): boolean {
  return (
    track.excluded ||
    track.excludedRanges.some(
      (range) => range.start <= start && range.end >= end,
    )
  )
}

export function matchedPercent(item: ViewSpineItem): number | null {
  if (item.sentenceCount === 0) return null
  return (item.matchedSentenceCount / item.sentenceCount) * 100
}

export function itemTone(item: ViewSpineItem): ReportTone {
  if (item.judgment === "approved" || item.judgment === "excluded") {
    return judgmentTone(item.judgment) ?? "muted"
  }
  if (item.status === "not-found") {
    return "poor"
  }
  if (item.status === "audio-only") {
    return "moderate"
  }
  if (item.status !== "aligned") {
    return "muted"
  }
  return percentTone(matchedPercent(item))
}

export function trackTone(track: Track): ReportTone {
  if (track.excluded) {
    return "muted"
  }
  if (track.duration <= 0) {
    return "muted"
  }
  const placed = track.matchedSeconds + track.interpolatedSeconds
  if (placed === 0) {
    return "poor"
  }
  return (placed / track.duration) * 100 > TRACK_PLACED_GOOD
    ? "good"
    : "moderate"
}

export function engineLabel(config: ReportJob["config"]): string | null {
  if (!config) return null
  const parts =
    config.aligner === "ctc"
      ? [config.ctcEngine, config.ctcModel]
      : [config.transcriptionEngine, config.whisperModel]
  const label = parts.filter(Boolean).join(" ")
  return label || null
}

export function hrefStem(href: string): string {
  return (href.split("/").pop() ?? href).replace(/\.[^.]+$/, "")
}

export function trackLabel(track: ViewTrack): string {
  return track.source?.title ?? hrefStem(track.name)
}

export function spansOf(spans: ReportSpan[], index: number): ReportSpan[] {
  return spans.filter((span) => span.spine === index)
}

export function trackClip(
  bookUuid: UUID,
  track: Track,
  range?: { start?: number; end?: number; label?: string | null },
): Clip | null {
  const label = range?.label ?? trackLabel(track)

  if (track.playback === "readaloud" && track.readaloudHref) {
    return {
      bookUuid,
      path: track.readaloudHref,
      via: "read",
      name: track.name,
      ...(range?.start !== undefined && { start: range.start }),
      ...(range?.end !== undefined && { end: range.end }),
      label,
      sublabel: track.name,
    }
  }

  if (track.playback !== "original" || !track.source) {
    return null
  }

  const base = track.source.start
  return {
    bookUuid,
    path: track.source.file,
    name: track.name,
    start: base + (range?.start ?? 0),
    end: base + (range?.end ?? track.duration),
    label,
    sublabel: hrefStem(track.source.file),
  }
}

export function trackTime(
  track: Track,
  clip: Clip,
  currentTime: number,
): number {
  if (clip.via === "read") return currentTime
  return currentTime - (track.source?.start ?? 0)
}

export function readStored<T extends string | number>(
  key: string,
  parse: (raw: string) => T | null,
  fallback: T,
): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null ? fallback : (parse(raw) ?? fallback)
  } catch {
    return fallback
  }
}

export function store(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    return
  }
}
