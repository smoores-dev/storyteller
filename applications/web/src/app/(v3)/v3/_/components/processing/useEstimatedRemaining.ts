"use client"

import { type DisplayJob } from "@/database/jobs"
import { useGetAlignmentEstimateQuery } from "@/store/api"
import { type UUID } from "@/uuid"

export function useEstimatedRemaining(job: DisplayJob | null): number | null {
  const isRunning = job?.status === "RUNNING"
  const bookUuid = job?.bookUuid ?? ("" as UUID)
  const config = job?.config ?? null
  const aligner = config?.aligner
  const isCtc = aligner === "ctc"
  const engine = (isCtc ? config?.ctcEngine : config?.transcriptionEngine) ?? ""
  const model = isCtc ? null : config?.whisperModel ?? null

  const { data } = useGetAlignmentEstimateQuery(
    {
      bookUuid,
      engine,
      whisperModel: model,
      restart: job?.restart || false,
    },
    { skip: !isRunning || !job.bookUuid || !engine },
  )

  if (!isRunning || !data?.estimateSeconds || !job.startedAt) return null

  const elapsedSeconds = Math.floor(
    (Date.now() - new Date(job.startedAt).getTime()) / 1000,
  )
  return Math.max(0, data.estimateSeconds - elapsedSeconds)
}
