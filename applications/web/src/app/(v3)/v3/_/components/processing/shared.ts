import { type PublicJob } from "@/database/jobs"

export const STAGE_SEQUENCE = [
  "SPLIT_TRACKS",
  "TRANSCRIBE_CHAPTERS",
  "SYNC_CHAPTERS",
] as const

export type Stage = (typeof STAGE_SEQUENCE)[number]

export type ProcessingStatus =
  | "queued"
  | "running"
  | "paused"
  | "done"
  | "error"

export type ProcessingView = {
  stage: Stage | null
  // progress within the current stage, 0..1
  stageProgress: number
  status: ProcessingStatus
}

function normalizeStatus(status: string): ProcessingStatus {
  switch (status) {
    case "RUNNING":
      return "running"
    case "QUEUED":
      return "queued"
    case "PAUSED":
      return "paused"
    case "DONE":
      return "done"
    default:
      return "error"
  }
}

export function jobToView(
  job: Pick<PublicJob, "status" | "stage" | "progress">,
): ProcessingView {
  return {
    stage: job.stage,
    stageProgress: job.progress,
    status: normalizeStatus(job.status),
  }
}

// overall progress across the three stages, 0..1.
export function overallProgress(view: ProcessingView): number {
  if (view.status === "done") return 1
  if (view.stage == null) return 0
  const index = STAGE_SEQUENCE.indexOf(view.stage)
  return (index + view.stageProgress) / STAGE_SEQUENCE.length
}
