"use client"

import {
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  useQueryState,
} from "nuqs"
import { useEffect, useEffectEvent, useState } from "react"

import { Button } from "@v3/_/components/ui/button"
import { Input } from "@v3/_/components/ui/input"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@v3/_/components/ui/item"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@v3/_/components/ui/select"

import { GradePill } from "@/app/(v3)/v3/_/components/books/grade-pill"
import { StaticProgressBar } from "@/app/(v3)/v3/_/components/processing/ProgressVisualization"
import {
  jobToView,
  overallProgress,
} from "@/app/(v3)/v3/_/components/processing/shared"
import { useStageLabels } from "@/app/(v3)/v3/_/components/processing/useStageLabels"
import { TooltipButton } from "@/app/(v3)/v3/_/components/ui/tooltip-button"
import { V3Link } from "@/app/(v3)/v3/_/components/v3-link"
import {
  useCommon,
  useTranslation,
} from "@/app/(v3)/v3/_/hooks/use-translation"
import {
  useFormatDate,
  useFormatDuration,
  useFormatRelativeTime,
} from "@/app/(v3)/v3/_/lib/formatters"
import { type PublicJob } from "@/database/jobs"
import * as icon from "@/icons"
import {
  getCoverUrl,
  useCancelJobMutation,
  useGetAlignmentEstimateQuery,
  useGetJobsQuery,
  usePauseJobMutation,
  useReorderJobsMutation,
  useResumeJobMutation,
} from "@/store/api"
import { type UUID } from "@/uuid"

const PAGE_SIZE = 10

const SORT_OPTIONS = {
  recent: { sort: "finishedAt", order: "desc" },
  oldest: { sort: "finishedAt", order: "asc" },
  title: { sort: "title", order: "asc" },
  status: { sort: "status", order: "asc" },
} as const

type SortKey = keyof typeof SORT_OPTIONS

export function QueueTab() {
  const t = useTranslation("Queue")
  const { data: activeJobs } = useGetJobsQuery({ type: "active" })
  const [cancelJob] = useCancelJobMutation()
  const [pauseJob] = usePauseJobMutation()
  const [resumeJob] = useResumeJobMutation()
  const [reorderJobs] = useReorderJobsMutation()

  const list = activeJobs ?? []
  const queued = list.filter((j) => j.status === "QUEUED")

  function move(job: PublicJob, direction: -1 | 1) {
    const index = queued.findIndex((j) => j.uuid === job.uuid)
    const target = index + direction
    if (index < 0 || target < 0 || target >= queued.length) return
    const next = [...queued]
    const [removed] = next.splice(index, 1)
    if (!removed) return
    next.splice(target, 0, removed)
    void reorderJobs({ order: next.map((j) => j.uuid) })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        {list.length > 0 && (
          <div>
            <h2 className="font-heading text-lg font-medium">{t("title")}</h2>
            <p className="text-muted-foreground text-sm">
              {t("subtitle", { count: list.length })}
            </p>
          </div>
        )}

        {list.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {list.map((job) => {
              const queuedIndex = queued.findIndex((j) => j.uuid === job.uuid)
              return (
                <JobItem
                  key={job.uuid}
                  job={job}
                  isFirst={queuedIndex <= 0}
                  isLast={queuedIndex >= queued.length - 1}
                  move={move}
                  pauseJob={(uuid) => void pauseJob({ uuid })}
                  resumeJob={(uuid) => void resumeJob({ uuid })}
                  cancelJob={(uuid) => void cancelJob({ uuid })}
                />
              )
            })}
          </div>
        )}
      </div>

      <FinishedJobs />
    </div>
  )
}

function FinishedJobs() {
  const t = useTranslation("Queue")
  const [debouncedSearch, setDebouncedSearch] = useQueryState(
    "search",
    parseAsString.withDefault(""),
  )
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useQueryState(
    "sort",
    parseAsStringEnum(Object.keys(SORT_OPTIONS) as SortKey[]).withDefault(
      "recent",
    ),
  )
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(0))

  const setDebouncedSearchEvent = useEffectEvent((search: string) => {
    void setDebouncedSearch(search)
    void setPage(0)
  })

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearchEvent(search)
    }, 300)
    return () => {
      clearTimeout(id)
    }
  }, [search])

  const { sort, order } = SORT_OPTIONS[sortKey]
  const { data: finishedJobs } = useGetJobsQuery(
    {
      type: "finished",
      search: debouncedSearch || undefined,
      sort,
      order,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    },
    { pollingInterval: 15000 },
  )

  const jobs = finishedJobs ?? []
  const hasNext = jobs.length === PAGE_SIZE
  const hasPrev = page > 0

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">{t("finishedTitle")}</h2>

      <div className="flex items-center gap-2">
        <Input
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
          }}
          className="h-9 flex-1"
        />
        <Select
          value={sortKey}
          onValueChange={(value) => {
            void setSortKey(value as SortKey)
            void setPage(0)
          }}
          items={Object.keys(SORT_OPTIONS).map((key) => ({
            label: t(`sort.${key as SortKey}`),
            value: key,
          }))}
        >
          <SelectTrigger className="h-9! w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.keys(SORT_OPTIONS).map((key) => (
              <SelectItem key={key} value={key}>
                {t(`sort.${key as SortKey}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {jobs.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("noFinished")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {jobs.map((job) => (
            <JobItem key={job.uuid} job={job} />
          ))}
        </div>
      )}

      {(hasPrev || hasNext) && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!hasPrev}
            onClick={() => {
              void setPage((p) => Math.max(p - 1, 0))
            }}
          >
            <icon.ChevronLeft className="size-4" />
            {t("previous")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasNext}
            onClick={() => {
              void setPage((p) => p + 1)
            }}
          >
            {t("next")}
            <icon.ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  )
}

const statusStyles: Record<string, string> = {
  RUNNING: "bg-primary/10 text-primary",
  QUEUED: "bg-muted text-muted-foreground",
  PAUSED: "bg-amber-500/10 text-amber-600",
  ERROR: "bg-destructive/10 text-destructive",
  DONE: "bg-green-500/10 text-green-600",
  CANCELED: "bg-orange-500/10 text-orange-600",
}

function StatusBadge({ status }: { status: PublicJob["status"] }) {
  const t = useTranslation("Queue")
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${statusStyles[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {t.has(`status.${status}`) ? t(`status.${status}`) : status.toLowerCase()}
    </span>
  )
}

function useEstimatedRemaining(job: PublicJob) {
  const isRunning = job.status === "RUNNING"
  const bookUuid = job.bookUuid ?? ("" as UUID)
  const isCtc = job.config?.aligner === "ctc"
  const engine =
    (isCtc ? job.config?.ctcEngine : job.config?.transcriptionEngine) ?? ""
  const model = isCtc ? null : job.config?.whisperModel ?? null

  const { data } = useGetAlignmentEstimateQuery(
    {
      bookUuid,
      engine,
      whisperModel: model,
      restart: (job as { restart?: string | false }).restart || false,
    },
    { skip: !isRunning || !job.bookUuid || !engine },
  )

  if (!isRunning || !data?.estimateSeconds || !job.startedAt) return null

  const elapsedSeconds = Math.floor(
    (Date.now() - new Date(job.startedAt).getTime()) / 1000,
  )
  const remaining = Math.max(0, data.estimateSeconds - elapsedSeconds)

  return remaining
}

function JobItem({
  job,
  isFirst,
  isLast,
  move,
  pauseJob,
  resumeJob,
  cancelJob,
}: {
  job: PublicJob
  isFirst?: boolean
  isLast?: boolean
  move?: (job: PublicJob, direction: -1 | 1) => void
  pauseJob?: (uuid: UUID) => void
  resumeJob?: (uuid: UUID) => void
  cancelJob?: (uuid: UUID) => void
}) {
  const t = useTranslation("Queue")
  const c = useCommon()
  const stageLabels = useStageLabels()
  const relativeTime = useFormatRelativeTime()
  const formatDuration = useFormatDuration()
  const view = jobToView(job)
  const pct = Math.round(overallProgress(view) * 100)
  const stageLabel = view.stage ? stageLabels[view.stage] : null
  const isActive = job.status === "RUNNING" || job.status === "PAUSED"
  const estimatedRemaining = useEstimatedRemaining(job)

  const runTime = (() => {
    const stats = (job as { stats?: { totalWallMs: number } | null }).stats

    if (stats?.totalWallMs) {
      return formatDuration(stats.totalWallMs / 1000)
    }

    if (job.finishedAt && job.startedAt) {
      const ms =
        new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()
      return formatDuration(ms / 1000)
    }

    return null
  })()

  const formatDate = useFormatDate()
  const detail =
    job.status === "RUNNING" && stageLabel ? (
      `${stageLabel} · ${pct}%`
    ) : job.status === "QUEUED" ? (
      t("detail.waiting")
    ) : job.status === "PAUSED" ? (
      t("detail.paused")
    ) : job.finishedAt ? (
      <time
        title={formatDate(job.finishedAt)}
        dateTime={formatDate(job.finishedAt)}
      >
        {t("detail.finished", { time: relativeTime(job.finishedAt) })}
      </time>
    ) : (
      job.status.toLowerCase()
    )

  const configSummary = (
    job.config?.aligner === "ctc"
      ? [job.config.ctcEngine, job.config.language]
      : [
          job.config?.transcriptionEngine,
          job.config?.whisperModel,
          job.config?.language,
        ]
  )
    .filter(Boolean)
    .join(" · ")

  return (
    <Item variant="outline" className="items-start">
      <ItemMedia variant="image" className="self-center">
        {job.bookUuid ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={getCoverUrl(job.bookUuid, {
              width: 64,
              height: 64,
              updatedAt: job.updatedAt,
            })}
            alt=""
          />
        ) : (
          <div className="bg-muted flex size-full items-center justify-center">
            <icon.BookAlt className="text-muted-foreground size-4" />
          </div>
        )}
      </ItemMedia>

      <ItemContent>
        <ItemTitle className="max-w-full">
          <V3Link
            href={`/books/${job.bookUuid}`}
            className="hover:text-primary truncate hover:underline"
          >
            {job.bookTitle ?? t("untitled")}
          </V3Link>
          <StatusBadge status={job.status} />
          {job.status === "DONE" && job.alignmentGrade && job.bookUuid && (
            <V3Link
              href={`/books/${job.bookUuid}?report=true`}
              className="inline-flex items-center gap-1"
            >
              <GradePill grade={job.alignmentGrade} />
              {job.alignmentScore != null && (
                <span className="text-muted-foreground text-xs tabular-nums">
                  {job.alignmentScore}%
                </span>
              )}
            </V3Link>
          )}
        </ItemTitle>
        <ItemDescription>
          {detail}
          {runTime && job.status === "DONE"
            ? ` · ${t("detail.runTime", { duration: runTime })}`
            : ""}
          {estimatedRemaining != null
            ? ` · ${t("detail.remaining", { duration: formatDuration(estimatedRemaining, { approximate: true }) })}`
            : ""}
          {configSummary ? ` · ${configSummary}` : ""}
          {job.error ? ` · ${job.error}` : ""}
        </ItemDescription>
        {isActive && (
          <StaticProgressBar view={view} className="mt-1.5 max-w-xs" />
        )}
      </ItemContent>

      <ItemActions>
        {move && (
          <>
            <TooltipButton
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t("actions.moveUp")}
              tooltip={t("actions.moveUp")}
              delay={500}
              disabled={isFirst}
              onClick={() => {
                move(job, -1)
              }}
            >
              <icon.ChevronUp className="size-4" />
            </TooltipButton>
            <TooltipButton
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t("actions.moveDown")}
              tooltip={t("actions.moveDown")}
              delay={500}
              disabled={isLast}
              onClick={() => {
                move(job, 1)
              }}
            >
              <icon.ChevronDown className="size-4" />
            </TooltipButton>
          </>
        )}

        {job.status === "PAUSED" && resumeJob ? (
          <TooltipButton
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={t("actions.resume")}
            tooltip={t("actions.resume")}
            onClick={() => {
              resumeJob(job.uuid)
            }}
          >
            <icon.PlayerPlay className="size-4" />
          </TooltipButton>
        ) : pauseJob ? (
          <TooltipButton
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={t("actions.pause")}
            tooltip={t("actions.pause")}
            onClick={() => {
              pauseJob(job.uuid)
            }}
          >
            <icon.PlayerPause className="size-4" />
          </TooltipButton>
        ) : null}

        {cancelJob ? (
          <TooltipButton
            variant="ghost-destructive"
            size="icon"
            className="size-7"
            aria-label={c("actions.cancel")}
            tooltip={t("actions.cancel")}
            onClick={() => {
              cancelJob(job.uuid)
            }}
          >
            <icon.Close className="size-4" />
          </TooltipButton>
        ) : null}

        {job.status === "DONE" && job.bookUuid ? (
          <TooltipButton
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={t("actions.alignmentReport")}
            tooltip={t("actions.alignmentReport")}
            render={<V3Link href={`/books/${job.bookUuid}?report=true`} />}
          >
            <icon.FileText className="size-4" />
          </TooltipButton>
        ) : null}
      </ItemActions>
    </Item>
  )
}
