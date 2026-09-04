"use client"

import { type UniqueIdentifier } from "@dnd-kit/abstract"
import {
  Accessibility,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  defaultPreset,
} from "@dnd-kit/dom"
import { move } from "@dnd-kit/helpers"
import { DragDropProvider } from "@dnd-kit/react"
import { isSortable, useSortable } from "@dnd-kit/react/sortable"
import {
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  useQueryState,
} from "nuqs"
import { useEffect, useEffectEvent, useRef, useState } from "react"

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
import { cn } from "@/app/(v3)/v3/_/lib/utils"
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

type AnnounceKind = "lifted" | "moved" | "dropped" | "canceled"

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
  const serverOrder = list.map((job) => job.uuid)

  const [order, setOrder] = useState(serverOrder)
  const isDragging = useRef(false)
  const pendingOrder = useRef<string | null>(null)

  const orderKey = serverOrder.join()

  const syncOrder = useEffectEvent(() => {
    if (isDragging.current) return

    const pending = pendingOrder.current
    const sameJobs =
      pending !== null &&
      [...pending.split(",")].sort().join() === [...serverOrder].sort().join()

    if (pending !== null && pending !== orderKey && sameJobs) return

    pendingOrder.current = null
    setOrder(serverOrder)
  })

  useEffect(() => {
    syncOrder()
  }, [orderKey])

  const byUuid = new Map(list.map((job) => [job.uuid, job]))
  const jobs = order.flatMap((uuid) => byUuid.get(uuid) ?? [])

  const announce = useEffectEvent(
    (kind: AnnounceKind, id: UniqueIdentifier, index: number) =>
      t(`announce.${kind}`, {
        title: byUuid.get(String(id) as UUID)?.bookTitle ?? t("untitled"),
        position: index + 1,
        total: jobs.length,
      }),
  )

  const [plugins] = useState(() => [
    ...defaultPreset.plugins.filter((plugin) => plugin !== Accessibility),
    Accessibility.configure({
      screenReaderInstructions: { draggable: t("announce.instructions") },
      announcements: {
        dragstart: ({ operation: { source } }: DragStartEvent) =>
          source && isSortable(source)
            ? announce("lifted", source.id, source.index)
            : undefined,
        dragover: ({ operation: { source } }: DragOverEvent) =>
          source && isSortable(source)
            ? announce("moved", source.id, source.index)
            : undefined,
        dragend: ({ operation: { source }, canceled }: DragEndEvent) =>
          source && isSortable(source)
            ? announce(
                canceled ? "canceled" : "dropped",
                source.id,
                canceled ? source.initialIndex : source.index,
              )
            : undefined,
      },
    }),
  ])

  const actions = {
    pauseJob: (uuid: UUID) => void pauseJob({ uuid }),
    resumeJob: (uuid: UUID) => void resumeJob({ uuid }),
    cancelJob: (uuid: UUID) => void cancelJob({ uuid }),
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
            {list.length > 1 && (
              <p className="text-muted-foreground mt-1 text-sm">
                {t("reorderHint")}
              </p>
            )}
          </div>
        )}

        {list.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <DragDropProvider
            plugins={plugins}
            onDragStart={() => {
              isDragging.current = true
            }}
            onDragEnd={(event) => {
              isDragging.current = false
              if (event.canceled) return

              const next = move(order, event)
              pendingOrder.current = next.join()
              setOrder(next)
              void reorderJobs({ order: next })
            }}
          >
            <div className="flex flex-col gap-2">
              {jobs.map((job, index) => (
                <SortableJobItem
                  key={job.uuid}
                  job={job}
                  index={index}
                  {...actions}
                />
              ))}
            </div>
          </DragDropProvider>
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

type JobActions = {
  pauseJob?: (uuid: UUID) => void
  resumeJob?: (uuid: UUID) => void
  cancelJob?: (uuid: UUID) => void
}

function SortableJobItem({
  job,
  index,
  ...actions
}: { job: PublicJob; index: number } & JobActions) {
  const { ref, handleRef, isDragging } = useSortable({
    id: job.uuid,
    index,
  })

  return (
    <JobItem
      job={job}
      dragRef={ref}
      handleRef={handleRef}
      isDragging={isDragging}
      {...actions}
    />
  )
}

function JobItem({
  job,
  dragRef,
  handleRef,
  isDragging,
  pauseJob,
  resumeJob,
  cancelJob,
}: {
  job: PublicJob
  dragRef?: (element: Element | null) => void
  handleRef?: (element: Element | null) => void
  isDragging?: boolean
} & JobActions) {
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
    <Item
      ref={dragRef}
      variant="outline"
      className={cn(
        "items-start",
        isDragging && "opacity-60 shadow-md",
        job.status === "RUNNING" && "border-primary/40",
      )}
    >
      {handleRef && (
        <button
          ref={handleRef}
          type="button"
          aria-label={t("actions.reorder", {
            title: job.bookTitle ?? t("untitled"),
          })}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex size-7 shrink-0 cursor-grab touch-none items-center justify-center self-center rounded outline-none focus-visible:ring-2 active:cursor-grabbing"
        >
          <icon.GripVertical className="size-4" />
        </button>
      )}

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
