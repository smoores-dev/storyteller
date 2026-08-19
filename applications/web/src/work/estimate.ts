import { getBookOrThrow } from "@/database/books"
import { getFinishedJobStats } from "@/database/jobs"
import type { UUID } from "@/uuid"

import type { RestartMode } from "./distributor"
import type { JobStats, StageName } from "./jobStats"
import type { RunConfig } from "./runConfig"

export interface EstimateTarget {
  audioDurationSeconds: number | null
  engine: string
  whisperModel: string | null
  restart: RestartMode
}

export interface EstimateResult {
  estimateSeconds: number | null
  sampleSize: number
}

type HistoryRow = { config: RunConfig; restart: RestartMode; stats: JobStats }

function stagesForRestart(restart: RestartMode): StageName[] {
  if (restart === "sync") return ["SYNC_CHAPTERS"]
  if (restart === "transcription")
    return ["TRANSCRIBE_CHAPTERS", "SYNC_CHAPTERS"]
  return ["SPLIT_TRACKS", "TRANSCRIBE_CHAPTERS", "SYNC_CHAPTERS"]
}

export function estimateAlignment(
  target: EstimateTarget,
  history: HistoryRow[],
): EstimateResult {
  if (!target.audioDurationSeconds) {
    return { estimateSeconds: null, sampleSize: 0 }
  }

  const matching = history.filter(
    (row) =>
      row.config.transcriptionEngine === target.engine &&
      row.config.whisperModel === target.whisperModel,
  )

  if (matching.length === 0) {
    return { estimateSeconds: null, sampleSize: 0 }
  }

  const requiredStages = stagesForRestart(target.restart)
  let totalEstimateMs = 0

  for (const stage of requiredStages) {
    const samples = matching.filter(
      (row) =>
        row.stats.stages[stage] != null &&
        row.stats.audioDurationSeconds != null &&
        row.stats.audioDurationSeconds > 0,
    )

    if (samples.length === 0) {
      return { estimateSeconds: null, sampleSize: 0 }
    }

    const avgMsPerAudioSecond =
      samples.reduce((sum, row) => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return sum + row.stats.stages[stage]! / row.stats.audioDurationSeconds!
      }, 0) / samples.length

    totalEstimateMs += avgMsPerAudioSecond * target.audioDurationSeconds
  }

  return {
    estimateSeconds: Math.round(totalEstimateMs / 1000),
    sampleSize: matching.length,
  }
}

export async function getEstimate(
  bookUuid: UUID,
  options: {
    engine: string
    whisperModel: string | null
    restart: RestartMode
  },
): Promise<EstimateResult> {
  const book = await getBookOrThrow(bookUuid)
  const audioDurationSeconds = book.audiobook?.duration ?? null

  const history = await getFinishedJobStats()

  return estimateAlignment(
    {
      audioDurationSeconds,
      engine: options.engine,
      whisperModel: options.whisperModel,
      restart: options.restart,
    },
    history,
  )
}
