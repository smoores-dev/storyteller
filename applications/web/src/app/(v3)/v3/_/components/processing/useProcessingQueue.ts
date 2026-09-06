"use client"

import { useTranslation } from "@v3/_/hooks/use-translation"

import { type DisplayJob } from "@/database/jobs"
import { useGetJobsQuery } from "@/store/api"

import { type ProcessingView, jobToView, overallProgress } from "./shared"
import { useStageLabels } from "./useStageLabels"

export type ProcessingQueue = {
  active: DisplayJob[]
  current: DisplayJob | null
  queuedCount: number
  view: ProcessingView | null
  percent: number
  headline: string
}

export function useProcessingQueue(): ProcessingQueue {
  const { data: jobs } = useGetJobsQuery(
    { type: "active" },
    { pollingInterval: 30_000, skipPollingIfUnfocused: true },
  )
  const t = useTranslation("SettingsPage.tabs.queue")
  const stageLabels = useStageLabels()

  const active = jobs ?? []
  const current = active.find((job) => job.status === "RUNNING") ?? active[0]
  if (!current) {
    return {
      active,
      current: null,
      queuedCount: 0,
      view: null,
      percent: 0,
      headline: "",
    }
  }

  const view = jobToView(current)
  const headline =
    current.status === "PAUSED"
      ? t.plain("toast.paused")
      : current.status === "QUEUED"
        ? t.plain("toast.queued")
        : view.stage
          ? stageLabels[view.stage]
          : t.plain("toast.processing")

  return {
    active,
    current,
    queuedCount: active.length - 1,
    view,
    percent: Math.round(overallProgress(view) * 100),
    headline,
  }
}
