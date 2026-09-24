"use client"

import { type UniqueIdentifier } from "@dnd-kit/abstract"
import {
  Accessibility,
  defaultPreset,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/dom"
import { move } from "@dnd-kit/helpers"
import { DragDropProvider } from "@dnd-kit/react"
import { isSortable, useSortable } from "@dnd-kit/react/sortable"
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  useQueryState,
} from "nuqs"
import { Fragment, useEffect, useEffectEvent, useState } from "react"

import { Button } from "@v3/_/components/ui/button"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemMedia,
} from "@v3/_/components/ui/item"

import {
  audioPercentTone,
  percentTone,
  TONE_BADGE,
  TONE_TEXT,
} from "@/app/(v3)/v3/_/components/books/AlignmentReport/shared"
import { SearchInput } from "@/app/(v3)/v3/_/components/books/SearchInput"
import { GradePill } from "@/app/(v3)/v3/_/components/books/grade-pill"
import { StaticProgressBar } from "@/app/(v3)/v3/_/components/processing/ProgressVisualization"
import {
  jobToView,
  overallProgress,
} from "@/app/(v3)/v3/_/components/processing/shared"
import { useEstimatedRemaining } from "@/app/(v3)/v3/_/components/processing/useEstimatedRemaining"
import { useStageLabels } from "@/app/(v3)/v3/_/components/processing/useStageLabels"
import { ButtonGroupSeparator } from "@/app/(v3)/v3/_/components/ui/button-group"
import {
  FilterableMenu,
  FilterableMenuContent,
  FilterableMenuItem,
  FilterableMenuTrigger,
} from "@/app/(v3)/v3/_/components/ui/filterable-menu"
import { Spinner } from "@/app/(v3)/v3/_/components/ui/spinner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/app/(v3)/v3/_/components/ui/tooltip"
import { TooltipButton } from "@/app/(v3)/v3/_/components/ui/tooltip-button"
import { V3Link } from "@/app/(v3)/v3/_/components/v3-link"
import { createSortParser } from "@/app/(v3)/v3/_/hooks/use-book-filters"
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
import { type DisplayJob } from "@/database/jobs"
import * as icon from "@/icons"
import { JOB_STATUSES, type JobStatus } from "@/jobEvents"
import {
  getCoverUrl,
  useCancelJobMutation,
  useGetJobsQuery,
  usePauseJobMutation,
  useReorderJobsMutation,
  useResumeJobMutation,
} from "@/store/api"
import { type UUID } from "@/uuid"

const PAGE_SIZE = 25

type AnnounceKind = "lifted" | "moved" | "dropped" | "canceled"

const SORT_OPTIONS = {
  finishedAt: {
    field: "finishedAt",
    defaultDirection: "desc",
    icon: icon.Clock,
  },
  title: { field: "title", defaultDirection: "asc", icon: icon.Heading },
  status: { field: "status", defaultDirection: "asc", icon: icon.Tag },
} as const

type SortKey = keyof typeof SORT_OPTIONS

export function QueueTab() {
  const t = useTranslation("SettingsPage.tabs.queue")
  const { data: activeJobs } = useGetJobsQuery({ type: "active" })
  const [cancelJob] = useCancelJobMutation()
  const [pauseJob] = usePauseJobMutation()
  const [resumeJob] = useResumeJobMutation()
  const [reorderJobs] = useReorderJobsMutation()

  const jobs = activeJobs ?? []
  const order = jobs.map((job) => job.uuid)
  const byUuid = new Map(jobs.map((job) => [job.uuid, job]))

  const announce = (kind: AnnounceKind, id: UniqueIdentifier, index: number) =>
    t(`announce.${kind}`, {
      title: byUuid.get(String(id) as UUID)?.bookTitle ?? t("untitled"),
      position: index + 1,
      total: jobs.length,
    })

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

  // const pauseAll = () => {
  //   jobs.forEach((job) => {
  //     if (job.status === "RUNNING") {
  //       void pauseJob({ uuid: job.uuid })
  //     }
  //   })
  // }
  // const resumeAll = () => {
  //   jobs.forEach((job) => {
  //     if (job.status === "PAUSED") {
  //       void resumeJob({ uuid: job.uuid })
  //     }
  //   })
  // }

  const actions = {
    pauseJob: (uuid: UUID) => void pauseJob({ uuid }),
    resumeJob: (uuid: UUID) => void resumeJob({ uuid }),
    cancelJob: (uuid: UUID) => void cancelJob({ uuid }),
  }

  // const someAreActive = jobs.some((job) => job.status === "RUNNING")

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        {jobs.length > 0 && (
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">{t("title")}</h2>
              {/* <TooltipButton
                variant="outline"
                size="icon"
                tooltip={someAreActive ? t("pauseAll") : t("resumeAll")}
                aria-label={someAreActive ? t("pauseAll") : t("resumeAll")}
                onClick={someAreActive ? pauseAll : resumeAll}
              >
                {someAreActive ? <icon.PlayerPause /> : <icon.PlayerPlay />}
              </TooltipButton> */}
            </div>
            <p className="text-muted-foreground text-sm">
              {t("subtitle", { count: jobs.length })}
            </p>
            {/* {jobs.length > 1 && (
              <p className="text-muted-foreground mt-1 text-sm">
                {t("reorderHint")}
              </p>
            )} */}
          </div>
        )}

        {jobs.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <DragDropProvider
            plugins={plugins}
            onDragEnd={(event) => {
              if (event.canceled) return
              void reorderJobs({ order: move(order, event) })
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
  const t = useTranslation("SettingsPage.tabs.queue")
  const [debouncedSearch, setDebouncedSearch] = useQueryState(
    "search",
    parseAsString.withDefault(""),
  )
  const [search, setSearch] = useState("")
  const [sort, setSort] = useQueryState(
    "sort",
    createSortParser<SortKey>().withDefault({
      field: "finishedAt",
      direction: "desc",
    }),
  )

  const [statuses, setStatuses] = useQueryState(
    "status",
    parseAsArrayOf(parseAsStringEnum(Object.keys(JOB_STATUSES) as JobStatus[])),
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

  const { data: finishedJobs, isFetching } = useGetJobsQuery(
    {
      type: "finished",
      search: debouncedSearch || undefined,
      sort: sort.field,
      order: sort.direction,
      statuses: statuses ?? undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    },
    { pollingInterval: 15000 },
  )

  const jobs = finishedJobs ?? []
  const hasNext = jobs.length === PAGE_SIZE
  const hasPrev = page > 0

  const finishedJobsStatuses = JOB_STATUSES.filter(
    (status) =>
      status !== "RUNNING" && status !== "PAUSED" && status !== "QUEUED",
  )

  const filters = [
    { label: t("status.all"), value: "all" as const },
    ...finishedJobsStatuses.map((status) => ({
      label: t.plain(`status.${status}`),
      value: status,
    })),
  ]

  const handleStatusSelect = (status: JobStatus | "all") => {
    if (status === "all") {
      void setStatuses(null)
      return
    }

    void setStatuses((old) => {
      if (!old) {
        return [status]
      }

      if (old.includes(status)) {
        const newStatuses = old.filter((s) => s !== status)
        if (newStatuses.length === 0) {
          return null
        }
        return newStatuses
      }

      return [...old, status]
    })
  }

  const activeSort = SORT_OPTIONS[sort.field]

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">{t("finishedTitle")}</h2>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value)
            void setPage(null)
          }}
          placeholder={t.plain("searchPlaceholder")}
          className="h-8 w-full flex-1"
        >
          {isFetching && <Spinner className="text-muted-foreground size-4" />}
        </SearchInput>

        <div className="flex flex-wrap items-center gap-1">
          <FilterableMenu>
            <FilterableMenuTrigger
              render={
                <TooltipButton
                  size="default"
                  tooltip={t("filtersTitle")}
                  className="rounded-full px-2"
                  variant="outline"
                  aria-label={t("filtersTitle")}
                >
                  <icon.Filter />
                  {statuses?.length && statuses.length > 0 && (
                    <span className="text-xs">{statuses.length}</span>
                  )}
                </TooltipButton>
              }
            />
            <FilterableMenuContent>
              {filters.map((filter) => {
                const active =
                  filter.value === "all"
                    ? !statuses
                    : statuses
                      ? statuses.includes(filter.value)
                      : false
                return (
                  <FilterableMenuItem
                    key={filter.value}
                    onSelect={() => {
                      handleStatusSelect(filter.value)
                      void setPage(0)
                    }}
                    textValue={filter.value}
                    closeOnClick={false}
                  >
                    {filter.value === "all" ? (
                      t.plain("status.all")
                    ) : (
                      <StatusBadge status={filter.value} />
                    )}
                    {active && <icon.Check className="size-4" />}
                  </FilterableMenuItem>
                )
              })}
            </FilterableMenuContent>
          </FilterableMenu>

          <FilterableMenu>
            <div className="flex items-center gap-0 rounded-full">
              <FilterableMenuTrigger
                render={
                  <TooltipButton
                    size="icon"
                    variant="outline"
                    className="rounded-l-full rounded-r-none border-r-0"
                    tooltip={t("sortTitle")}
                    aria-label={t("sortTitle")}
                  >
                    <activeSort.icon className="size-4" />
                  </TooltipButton>
                }
              />
              <ButtonGroupSeparator />

              <TooltipButton
                size="icon"
                variant="outline"
                tooltip={t(`sort.${sort.direction}`)}
                data-slot="sort-button"
                className="rounded-l-none rounded-r-full border-l-0"
                aria-label={t(`sort.${sort.direction}`)}
                onClick={() => {
                  void setSort({
                    field: sort.field,
                    direction: sort.direction === "desc" ? "asc" : "desc",
                  })
                }}
              >
                {sort.direction === "desc" ? (
                  <icon.ArrowDown className="size-4" />
                ) : (
                  <icon.ArrowUp className="size-4" />
                )}
              </TooltipButton>
            </div>
            <FilterableMenuContent>
              {(Object.keys(SORT_OPTIONS) as SortKey[]).map((key) => {
                const active = key === sort.field
                return (
                  <FilterableMenuItem
                    key={key}
                    textValue={key}
                    closeOnClick={false}
                    onSelect={() => {
                      if (!active) {
                        void setSort({
                          field: key,
                          direction: SORT_OPTIONS[key].defaultDirection,
                        })
                      } else {
                        void setSort({
                          field: sort.field,
                          direction: sort.direction === "desc" ? "asc" : "desc",
                        })
                      }
                      void setPage(0)
                    }}
                  >
                    <span className="grow">{t(`sort.${key}`)}</span>
                    {active &&
                      (sort.direction === "asc" ? (
                        <icon.ArrowUp />
                      ) : (
                        <icon.ArrowDown />
                      ))}
                  </FilterableMenuItem>
                )
              })}
            </FilterableMenuContent>
          </FilterableMenu>
        </div>

        {/* <Select
          value={sortKey}
          onValueChange={(value) => {
            // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- tsgolint treats the cast as unnecessary but it still narrows the type
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
        </Select> */}
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

function StatusBadge({ status }: { status: DisplayJob["status"] }) {
  const t = useTranslation("SettingsPage.tabs.queue")
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${statusStyles[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {t.has(`status.${status}`) ? t(`status.${status}`) : status.toLowerCase()}
    </span>
  )
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
}: { job: DisplayJob; index: number } & JobActions) {
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
  job: DisplayJob
  dragRef?: (element: Element | null) => void
  handleRef?: (element: Element | null) => void
  isDragging?: boolean
} & JobActions) {
  const t = useTranslation("SettingsPage.tabs.queue")
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
      return formatDuration(stats.totalWallMs / 1000, {
        approximate: false,
        compact: false,
        full: true,
      })
    }

    if (job.finishedAt && job.startedAt) {
      const ms =
        new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()
      return formatDuration(ms / 1000, {
        approximate: false,
        compact: false,
        full: true,
      })
    }

    return null
  })()

  const formatDate = useFormatDate()
  const detail =
    job.status === "RUNNING" && stageLabel ? (
      `${stageLabel} · ${pct}%`
    ) : job.finishedAt ? (
      <time
        title={formatDate(job.finishedAt)}
        dateTime={formatDate(job.finishedAt)}
      >
        {t("detail.finished", { time: relativeTime(job.finishedAt) })}
      </time>
    ) : null

  const configSummary = (
    job.config?.aligner === "ctc"
      ? [job.config.ctcEngine, job.config.ctcModel, job.config.language]
      : [
          job.config?.transcriptionEngine,
          job.config?.whisperModel,
          job.config?.language,
        ]
  )
    .filter(Boolean)
    .join(" · ")

  const detailParts = [
    detail,
    runTime && job.status === "DONE"
      ? t("detail.runTime", { duration: runTime })
      : null,
    estimatedRemaining != null
      ? t("detail.remaining", {
          duration: formatDuration(estimatedRemaining, { approximate: true }),
        })
      : null,
    configSummary || null,
    job.error ?? null,
  ].filter((part) => part != null)

  return (
    <Item
      ref={dragRef}
      variant="outline"
      className={cn(
        "relative flex-nowrap gap-3 overflow-clip",
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
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -mr-1 flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded outline-none focus-visible:ring-2 active:cursor-grabbing"
        >
          <icon.GripVertical className="size-4" />
        </button>
      )}

      <ItemMedia variant="image" className="h-11 w-8 shrink-0">
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

      <ItemContent className="min-w-0 gap-0.5">
        <div className="flex w-full min-w-0 items-center gap-2 leading-snug font-medium">
          <V3Link
            href={`/books/${job.bookUuid}`}
            className="hover:text-primary min-w-0 flex-1 truncate hover:underline"
          >
            {job.bookTitle ?? t("untitled")}
          </V3Link>

          {job.status === "DONE" && job.alignmentGrade && job.bookUuid && (
            <V3Link
              href={`/books/${job.bookUuid}?report=true`}
              className="inline-flex shrink-0 items-center gap-1"
            >
              <GradePill grade={job.alignmentGrade} />
            </V3Link>
          )}
          {job.alignmentAudioCoverage != null &&
          job.alignmentSentenceCoverage != null ? (
            <Tooltip>
              <TooltipTrigger
                aria-label={t("actions.alignmentReport")}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 px-1 text-[11px]",
                  TONE_BADGE[percentTone(job.alignmentSentenceCoverage)],
                  TONE_TEXT[percentTone(job.alignmentSentenceCoverage)],
                )}
              >
                <icon.TextGrammar className="size-3" />{" "}
                {job.alignmentSentenceCoverage}%
              </TooltipTrigger>
              <TooltipContent> {t("actions.alignmentReport")} </TooltipContent>
            </Tooltip>
          ) : null}
          {job.alignmentAudioCoverage != null &&
          job.alignmentSentenceCoverage != null ? (
            <Tooltip>
              <TooltipTrigger
                aria-label={t("actions.alignmentReport")}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 px-1 text-[11px]",
                  TONE_BADGE[audioPercentTone(job.alignmentAudioCoverage)],
                  TONE_TEXT[audioPercentTone(job.alignmentAudioCoverage)],
                )}
              >
                <icon.Audiobook className="size-3" />{" "}
                {job.alignmentAudioCoverage}%
              </TooltipTrigger>
              <TooltipContent> {t("actions.alignmentReport")} </TooltipContent>
            </Tooltip>
          ) : null}

          {job.status === "DONE" && job.bookUuid && job.alignmentReportUuid ? (
            <TooltipButton
              variant="ghost"
              className="size-5 shrink-0"
              aria-label={t("actions.alignmentReport")}
              tooltip={t("actions.alignmentReport")}
              render={
                <V3Link
                  href={`/books/${job.bookUuid}?report=true&reportUuid=${job.alignmentReportUuid}`}
                />
              }
            >
              <icon.FileText className="size-4" />
            </TooltipButton>
          ) : null}
        </div>
        <div className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <StatusBadge status={job.status} />
          {detailParts.map((part, i) => (
            <Fragment key={i}>
              {i > 0 && <span aria-hidden>·</span>}
              <span className="min-w-0 break-words">{part}</span>
            </Fragment>
          ))}
        </div>
      </ItemContent>

      <ItemActions className="shrink-0 gap-1">
        {job.status === "PAUSED" && resumeJob ? (
          <TooltipButton
            variant="ghost"
            className="size-5"
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
            className="size-5"
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
            className="size-5"
            aria-label={c("actions.cancel")}
            tooltip={t("actions.cancel")}
            onClick={() => {
              cancelJob(job.uuid)
            }}
          >
            <icon.Close className="size-4" />
          </TooltipButton>
        ) : null}
      </ItemActions>

      {isActive && (
        <div className="absolute right-0 bottom-0 left-0 w-full">
          <StaticProgressBar view={view} className="h-1" />
        </div>
      )}
    </Item>
  )
}
