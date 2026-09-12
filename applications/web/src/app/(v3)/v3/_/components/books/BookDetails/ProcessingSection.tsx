"use client"

import { type ReactNode } from "react"

import { Badge } from "@v3/_/components/ui/badge"
import { Button } from "@v3/_/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@v3/_/components/ui/dropdown-menu"
import { V3Link } from "@v3/_/components/v3-link"
import { useReportPanel } from "@v3/_/hooks/use-report-panel"
import { useCommon, useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { useStageLabels } from "@/app/(v3)/v3/_/components/processing/useStageLabels"
import {
  useFormatDate,
  useFormatDuration,
  useFormatRelativeTime,
} from "@/app/(v3)/v3/_/lib/formatters"
import { IconReadaloud } from "@/components/icons/IconReadaloud"
import { type BookWithRelations } from "@/database/books"
import { usePermission } from "@/hooks/usePermission"
import * as icon from "@/icons"
import {
  useCancelProcessingMutation,
  useGetAlignmentEstimateQuery,
  useGetBookAlignmentReportQuery,
  useGetJobsQuery,
} from "@/store/api"
import { type StageName } from "@/work/jobStats"

import { CollapsibleSection } from "./sections/CollapsibleSection"
import { DetailRow } from "./sections/DetailsSection"
import {
  type ProcessRestart,
  type ProcessingPosition,
  useProcessingRun,
} from "./useProcessingRun"

const STAGE_ORDER: StageName[] = [
  "SPLIT_TRACKS",
  "TRANSCRIBE_CHAPTERS",
  "SYNC_CHAPTERS",
]

export function ProcessingDropdown({
  positions,
  onSelect,
  triggerLabel,
  triggerIcon,
  size = "sm",
}: {
  positions: ProcessingPosition[]
  onSelect: (restart: ProcessRestart, modifiers: { shiftKey: boolean }) => void
  triggerLabel: string
  triggerIcon?: ReactNode
  size?: "sm" | "xs"
}) {
  const tp = useTranslation("Processing")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size={size}>
            {triggerIcon}
            {triggerLabel}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-fit">
        {positions.map((position) => (
          <DropdownMenuItem
            key={position.key}
            disabled={position.disabled}
            onClick={(event) => {
              onSelect(position.restart, { shiftKey: event.shiftKey })
            }}
          >
            {position.icon}
            {tp(position.labelKey)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ProcessingSection({ book }: { book: BookWithRelations }) {
  const [cancelProcessing] = useCancelProcessingMutation()
  const canProcess = usePermission("bookProcess")
  const { start, dialog, positions } = useProcessingRun([book])

  const hasEbook = book.ebook !== null
  const hasAudiobook = book.audiobook !== null
  const canCreateReadaloud = hasEbook && hasAudiobook && !book.readaloud

  const readaloudStatus = book.readaloud?.status

  const t = useTranslation("BookDetailsPage.alignment")
  const tp = useTranslation("Processing")
  const c = useCommon()
  const stageLabels = useStageLabels()

  const formatDate = useFormatDate()
  const formatDuration = useFormatDuration()

  const { data: latestFinishedJob } = useGetJobsQuery(
    { type: "finished", bookUuid: book.uuid, limit: 1 },
    { skip: readaloudStatus !== "ALIGNED" },
  )

  const { data: activeJobs } = useGetJobsQuery(
    { type: "active", bookUuid: book.uuid, limit: 1 },
    { skip: readaloudStatus !== "PROCESSING" },
  )

  const activeJob = activeJobs?.[0]

  const activeEngine =
    activeJob?.config?.aligner === "ctc"
      ? activeJob.config.ctcEngine
      : activeJob?.config?.transcriptionEngine

  const { data: estimateData } = useGetAlignmentEstimateQuery(
    {
      bookUuid: book.uuid,
      engine: activeEngine ?? "",
      whisperModel:
        activeJob?.config?.aligner === "ctc"
          ? null
          : (activeJob?.config?.whisperModel ?? null),
      restart: activeJob?.restart || false,
    },
    { skip: readaloudStatus !== "PROCESSING" || !activeEngine },
  )

  const remainingSeconds = (() => {
    if (!estimateData || estimateData.estimateSeconds == null) return null
    const currentStage = book.readaloud?.currentStage
    const currentIndex = currentStage ? STAGE_ORDER.indexOf(currentStage) : -1
    if (currentIndex === -1) return estimateData.estimateSeconds

    let total = 0
    for (const [i, stage] of STAGE_ORDER.entries()) {
      const seconds = estimateData.stageSeconds[stage]
      if (seconds == null || i < currentIndex) continue
      total +=
        i === currentIndex
          ? seconds * (1 - (book.readaloud?.stageProgress ?? 0))
          : seconds
    }
    return total
  })()

  const alignedInDuration = (() => {
    const stats = latestFinishedJob?.[0]?.stats as
      | { totalWallMs: number }
      | null
      | undefined

    if (stats?.totalWallMs) {
      return formatDuration(stats.totalWallMs / 1000)
    }

    const job = latestFinishedJob?.[0]
    if (job?.finishedAt && job.startedAt) {
      const ms =
        new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()
      return formatDuration(ms / 1000)
    }

    return null
  })()

  if (!readaloudStatus && !canCreateReadaloud && !canProcess) {
    return null
  }

  return (
    <CollapsibleSection
      sectionKey="alignment"
      title={t("title")}
      className="mb-3 flex flex-col gap-2"
    >
      {readaloudStatus === "ALIGNED" && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <icon.Check className="h-4 w-4 text-green-600" />
            <span>{t("aligned")}</span>
          </div>
          {canProcess && (
            <ProcessingDropdown
              positions={positions}
              onSelect={start}
              triggerLabel={tp("reprocess")}
            />
          )}
        </div>
      )}

      {readaloudStatus === "QUEUED" && (
        <div className="flex items-center justify-between">
          <span className="text-sm">{t("queued")}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void cancelProcessing({ uuid: book.uuid })}
          >
            <icon.Close className="mr-1 h-3 w-3" />
            {c("actions.cancel")}
          </Button>
        </div>
      )}

      {readaloudStatus === "PROCESSING" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm">
              {book.readaloud
                ? stageLabels[book.readaloud.currentStage]
                : t("processing")}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void cancelProcessing({ uuid: book.uuid })}
            >
              <icon.Close className="mr-1 h-3 w-3" />
              {c("actions.cancel")}
            </Button>
          </div>

          <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full transition-all"
              style={{
                width: `${Math.floor((book.readaloud?.stageProgress ?? 0) * 100)}%`,
              }}
            />
          </div>

          {remainingSeconds != null && (
            <span className="text-tinted text-xs">
              {t("estimatedRemaining", {
                duration: formatDuration(remainingSeconds, {
                  approximate: true,
                }),
              })}
            </span>
          )}
        </div>
      )}

      {(readaloudStatus === "ERROR" || readaloudStatus === "STOPPED") && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <icon.AlertTriangle className="text-destructive h-4 w-4" />
            <span>
              {readaloudStatus === "ERROR" ? t("error") : t("stopped")}
            </span>
          </div>
          {canProcess && (
            <ProcessingDropdown
              positions={positions}
              onSelect={start}
              triggerLabel={t("retry")}
            />
          )}
        </div>
      )}

      {!readaloudStatus && canCreateReadaloud && (
        <Button
          size="sm"
          className="bg-cover-header max-w-40"
          onClick={(event) => {
            start(false, { shiftKey: event.shiftKey })
          }}
        >
          <IconReadaloud className="mr-1 h-4 w-4" />
          {t("createReadaloud")}
        </Button>
      )}

      {!readaloudStatus && !canCreateReadaloud && (
        <span className="text-muted-foreground text-sm">
          {t("unprocessed")}
        </span>
      )}

      {book.alignmentSummary?.grade && <AlignmentReportSummary book={book} />}

      {dialog}

      <div className="grid grid-cols-2 items-start gap-x-4 gap-y-2">
        {book.alignedAt && (
          <DetailRow label={t("lastAligned")}>
            <time dateTime={book.alignedAt} title={formatDate(book.alignedAt)}>
              {formatDate(book.alignedAt, { timeStyle: undefined })}
            </time>
          </DetailRow>
        )}

        {alignedInDuration && (
          <DetailRow label={t("alignedIn")}>{alignedInDuration}</DetailRow>
        )}

        {book.alignedWith && (
          <DetailRow label={t("transcriptionEngine")}>
            {book.alignedWith}
          </DetailRow>
        )}

        {book.alignedByStorytellerVersion && (
          <DetailRow label={t("storytellerVersion")}>
            {book.alignedByStorytellerVersion}
          </DetailRow>
        )}
      </div>
    </CollapsibleSection>
  )
}

type GradeTone = "positive" | "good" | "moderate" | "poor"

function gradeTone(grade: string): GradeTone {
  if (grade.startsWith("A")) return "positive"
  if (grade.startsWith("B")) return "good"
  if (grade === "C") return "moderate"
  return "poor"
}

const GRADE_BADGE: Record<GradeTone, string> = {
  positive:
    "border-positive-border bg-positive-bg text-positive dark:border-positive-900 dark:bg-positive-950/40 dark:text-positive-300",
  good: "border-good-border bg-good-bg text-good dark:border-good-900 dark:bg-good-950/40 dark:text-good-300",
  moderate:
    "border-moderate-border bg-moderate-bg text-moderate dark:border-moderate-900 dark:bg-moderate-950/40 dark:text-moderate-300",
  poor: "border-poor-border bg-poor-bg text-poor dark:border-poor-900 dark:bg-poor-950/40 dark:text-poor-300",
}

function AlignmentReportSummary({ book }: { book: BookWithRelations }) {
  const { data } = useGetBookAlignmentReportQuery({ uuid: book.uuid })
  const { setReportMode } = useReportPanel()
  const tp = useTranslation("Processing")
  const tr = useTranslation("AlignmentReport")
  const tNouns = useTranslation("Common.Nouns")
  const relativeTime = useFormatRelativeTime()

  const grade = data?.summary.grade ?? book.alignmentSummary?.grade
  if (!grade) return null
  const tone = gradeTone(grade)
  const summary = data?.summary

  const marks: { label: string; value: string }[] = summary
    ? [
        {
          label: tr("marks.sentences"),
          value:
            summary.sentencesTotal > 0
              ? `${Math.round((summary.sentencesMatched / summary.sentencesTotal) * 100)}%`
              : "—",
        },
        {
          label: tr("marks.audio"),
          value:
            summary.audioTotalSeconds > 0
              ? `${Math.round((summary.audioPlacedSeconds / summary.audioTotalSeconds) * 100)}%`
              : "—",
        },
        {
          label: tNouns("chapter", { count: summary.chapters }),
          value: `${summary.chapters}`,
        },
      ]
    : []

  return (
    <div className="bg-card flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center gap-3">
        <Badge
          className={cn(
            "size-9 justify-center rounded-md border text-base font-semibold tabular-nums",
            GRADE_BADGE[tone],
          )}
        >
          {grade}
        </Badge>
        <div className="flex flex-1 flex-wrap gap-x-4 gap-y-0.5">
          {marks.map((mark) => (
            <div key={mark.label} className="flex flex-col">
              <span className="text-sm font-medium tabular-nums">
                {mark.value}
              </span>
              <span className="text-muted-foreground text-xs">
                {mark.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <button
          type="button"
          onClick={() => void setReportMode(true)}
          className="hover:text-primary inline-flex items-center gap-1 hover:underline"
        >
          <icon.FileText className="size-3.5" /> {tp("viewReport")}
        </button>
        {data?.jobUuid && (
          <V3Link
            href="/settings?tab=queue"
            className="hover:text-primary inline-flex items-center gap-1 hover:underline"
          >
            <icon.Briefcase className="size-3.5" />{" "}
            {tr("createdByJob", {
              relativeTime: relativeTime(data.createdAt, { now: new Date() }),
            })}
          </V3Link>
        )}
      </div>
    </div>
  )
}
