import type { TimingSummary } from "@storyteller-platform/ghost-story"

import { type AlignmentGrade } from "@/shelves"

export type StageName = "SPLIT_TRACKS" | "TRANSCRIBE_CHAPTERS" | "SYNC_CHAPTERS"

export interface AlignmentJobSummary {
  grade: AlignmentGrade
  score: number | null
  sentenceCoverage: number | null
  audioCoverage: number | null
  chapters: number
  excluded: number
  excludedByRule: number
  review: number
  failed: number
}

export interface JobStats {
  audioDurationSeconds: number | null
  pageCount: number | null
  stages: Partial<Record<StageName, number>>
  totalWallMs: number
  alignment?: AlignmentJobSummary | null
}

const PHASE_TO_STAGE: Record<string, StageName> = {
  split_tracks: "SPLIT_TRACKS",
  transcribe_chapters: "TRANSCRIBE_CHAPTERS",
  sync: "SYNC_CHAPTERS",
}

export function buildJobStats(
  summary: TimingSummary,
  inputs: {
    audioDurationSeconds: number | null
    pageCount: number | null
    alignment?: AlignmentJobSummary | null
  },
): JobStats {
  const stages: Partial<Record<StageName, number>> = {}

  for (const phase of summary.phases) {
    const stage = PHASE_TO_STAGE[phase.name]
    if (stage) {
      stages[stage] = phase.duration
    }
  }

  return {
    audioDurationSeconds: inputs.audioDurationSeconds,
    pageCount: inputs.pageCount,
    stages,
    totalWallMs: summary.wallClockMs,
    alignment: inputs.alignment ?? null,
  }
}
