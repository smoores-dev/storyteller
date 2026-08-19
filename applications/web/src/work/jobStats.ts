import type { TimingSummary } from "@storyteller-platform/ghost-story"

export type StageName = "SPLIT_TRACKS" | "TRANSCRIBE_CHAPTERS" | "SYNC_CHAPTERS"

export interface JobStats {
  audioDurationSeconds: number | null
  pageCount: number | null
  stages: Partial<Record<StageName, number>>
  totalWallMs: number
}

const PHASE_TO_STAGE: Record<string, StageName> = {
  split_tracks: "SPLIT_TRACKS",
  transcribe_chapters: "TRANSCRIBE_CHAPTERS",
  sync: "SYNC_CHAPTERS",
}

export function buildJobStats(
  summary: TimingSummary,
  inputs: { audioDurationSeconds: number | null; pageCount: number | null },
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
  }
}
