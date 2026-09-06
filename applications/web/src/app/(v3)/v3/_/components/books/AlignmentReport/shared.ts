import { type Clip } from "@v3/_/components/audio"

import {
  type Judgment,
  type ReportChapterAudio,
  type ReportSpineItem,
} from "@/alignmentReportView"
import { type UUID } from "@/uuid"

export type ReportTone = "positive" | "good" | "moderate" | "poor" | "muted"

export const TONE_TEXT: Record<ReportTone, string> = {
  positive: "text-positive",
  good: "text-good",
  moderate: "text-moderate",
  poor: "text-poor",
  muted: "text-muted-foreground",
}

export const TONE_FILL: Record<ReportTone, string> = {
  positive: "bg-positive",
  good: "bg-good",
  moderate: "bg-moderate",
  poor: "bg-poor",
  muted: "bg-muted-foreground/40",
}

export const TONE_STROKE: Record<ReportTone, string> = {
  positive: "stroke-positive",
  good: "stroke-good",
  moderate: "stroke-moderate",
  poor: "stroke-poor",
  muted: "stroke-muted-foreground/40",
}

export const TONE_BADGE: Record<ReportTone, string> = {
  positive: "bg-positive-bg text-positive",
  good: "bg-good-bg text-good",
  moderate: "bg-moderate-bg text-moderate",
  poor: "bg-poor-bg text-poor",
  muted: "bg-muted text-muted-foreground",
}

export const TONE_TILE: Record<ReportTone, string> = {
  positive: "border-positive-border bg-positive-bg text-positive",
  good: "border-good-border bg-good-bg text-good",
  moderate: "border-moderate-border bg-moderate-bg text-moderate",
  poor: "border-poor-border bg-poor-bg text-poor",
  muted: "border-border bg-muted text-foreground",
}

export const BAND_VERDICT = [
  "excellent",
  "strong",
  "good",
  "fair",
  "rough",
  "patchy",
  "weak",
  "failed",
] as const

export function bandTone(band: number): ReportTone {
  if (band <= 1) return "positive"
  if (band <= 3) return "good"
  if (band <= 5) return "moderate"
  return "poor"
}

export function percentTone(percent: number | null): ReportTone {
  if (percent === null) return "muted"
  if (percent >= 95) return "positive"
  if (percent >= 85) return "good"
  if (percent >= 70) return "moderate"
  return "poor"
}

export function confidenceTone(confidence: number | null): ReportTone {
  if (confidence === null) return "muted"
  if (confidence >= 90) return "positive"
  if (confidence >= 80) return "good"
  if (confidence >= 70) return "moderate"
  return "poor"
}

export function judgmentTone(judgment: Judgment | null): ReportTone | null {
  if (judgment === "approved") return "positive"
  if (judgment === "excluded") return "muted"
  return null
}

export function itemTone(item: ReportSpineItem): ReportTone {
  const judged = judgmentTone(item.judgment)
  if (judged) return judged
  if (item.kind === "unaligned") {
    return item.reason === "not-found" ? "poor" : "muted"
  }
  return confidenceTone(item.confidence)
}

export function hrefStem(href: string): string {
  return (href.split("/").pop() ?? href).replace(/\.[^.]+$/, "")
}

export function chapterClip(
  bookUuid: UUID,
  label: string,
  audio: ReportChapterAudio,
): Clip {
  return {
    bookUuid,
    path: audio.name,
    name: audio.name,
    start: audio.start,
    end: audio.end,
    label,
    sublabel: audio.name,
  }
}

export function fileClip(
  bookUuid: UUID,
  name: string,
  range?: { start: number; end?: number; label?: string | null },
): Clip {
  return {
    bookUuid,
    path: name,
    name,
    ...(range && { start: range.start }),
    ...(range?.end !== undefined && { end: range.end }),
    label: range?.label ?? hrefStem(name),
    sublabel: name,
  }
}
