"use client"

import { formatClock } from "@v3/_/components/audio"
import { Button } from "@v3/_/components/ui/button"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { type BookAlignmentReportView } from "@/alignmentReportView"
import { ProcessingDropdown } from "@/app/(v3)/v3/_/components/books/BookDetails/ProcessingSection"
import { useProcessingRun } from "@/app/(v3)/v3/_/components/books/BookDetails/useProcessingRun"
import {
  useFormatDate,
  useFormatDuration,
} from "@/app/(v3)/v3/_/lib/formatters"
import { type BookWithRelations } from "@/database/books"
import { usePermission } from "@/hooks/usePermission"
import * as icon from "@/icons"
import { useGetBookQuery } from "@/store/api"

import {
  BAND_VERDICT,
  TONE_TEXT,
  TONE_TILE,
  bandTone,
  confidenceTone,
  engineLabel,
  percentTone,
} from "./shared"

function percentOf(part: number, whole: number): number | null {
  return whole > 0 ? (part / whole) * 100 : null
}

function Stat({
  percent,
  label,
  sub,
}: {
  percent: number | null
  label: string
  sub: string
}) {
  return (
    <span className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span
        className={cn(
          "text-sm font-medium tabular-nums",
          TONE_TEXT[percentTone(percent)],
        )}
      >
        {percent === null ? "—" : `${Math.round(percent)}%`}
      </span>
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-muted-foreground/70 text-[11px] tabular-nums">
        {sub}
      </span>
    </span>
  )
}

function Reprocess({
  book,
  pending,
}: {
  book: BookWithRelations
  pending: number
}) {
  const t = useTranslation("Processing")
  const tr = useTranslation("AlignmentReport")
  const { start, dialog, positions, canProcessAny } = useProcessingRun([book])
  if (!canProcessAny) return null
  const sync = positions.find((position) => position.key === "sync")
  return (
    <div className="flex items-center gap-1">
      {pending > 0 && sync && !sync.disabled && (
        <Button
          size="xs"
          title={tr("pending.summary", { count: pending })}
          onClick={(event) => {
            start(sync.restart, { shiftKey: event.shiftKey })
          }}
        >
          <icon.Clock />
          {tr("pending.realign")}
        </Button>
      )}
      <ProcessingDropdown
        positions={positions}
        onSelect={start}
        triggerLabel={t("reprocess")}
        triggerIcon={<icon.Reload />}
        size="xs"
      />
      {dialog}
    </div>
  )
}

function Count({ value, label }: { value: number; label: string }) {
  if (value === 0) return null
  return (
    <span className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-sm font-medium tabular-nums">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </span>
  )
}

export function Masthead({
  view,
  narrow,
}: {
  view: BookAlignmentReportView
  narrow: boolean
}) {
  const t = useTranslation("AlignmentReport")
  const formatDate = useFormatDate()
  const formatDuration = useFormatDuration()
  const canProcess = usePermission("bookProcess")
  const { data: book } = useGetBookQuery(
    { uuid: view.bookUuid },
    { skip: !canProcess },
  )
  const { summary, job } = view
  const tone = bandTone(summary.band)
  const verdict = BAND_VERDICT[summary.band] ?? "failed"

  const provenance = [
    formatDate(view.createdAt),
    engineLabel(job?.config ?? null),
    job?.config?.language ?? null,
    job?.runSeconds
      ? t("job.took", { duration: formatDuration(job.runSeconds) })
      : null,
  ].filter((part): part is string => part !== null)

  return (
    <section
      className={cn(
        "bg-card flex w-fit max-w-full items-center gap-3 rounded-lg border px-3 py-2",
        narrow && "w-full",
      )}
    >
      <div
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-lg border text-xl",
          TONE_TILE[tone],
        )}
      >
        <span className="font-heading leading-none font-medium">
          {summary.grade}
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="font-heading text-base leading-tight font-medium">
          {t(`verdict.${verdict}`)}
        </h2>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
          <Stat
            percent={percentOf(
              summary.sentencesMatched,
              summary.sentencesTotal,
            )}
            label={t("stats.sentences")}
            sub={t("stats.sentencesSub", {
              aligned: summary.sentencesMatched,
              total: summary.sentencesTotal,
            })}
          />
          <Stat
            percent={percentOf(
              summary.audioPlacedSeconds,
              summary.audioTotalSeconds,
            )}
            label={t("stats.audio")}
            sub={t("stats.audioSub", {
              placed: formatClock(summary.audioPlacedSeconds),
              total: formatClock(summary.audioTotalSeconds),
            })}
          />
          <span className="flex items-baseline gap-1.5 whitespace-nowrap">
            <span
              className={cn(
                "text-sm font-medium tabular-nums",
                TONE_TEXT[confidenceTone(summary.confidence)],
              )}
            >
              {summary.confidence === null
                ? "—"
                : summary.confidence.toFixed(0)}
            </span>
            <span className="text-muted-foreground text-xs">
              {t("stats.confidence")}
            </span>
          </span>
          <Count
            value={summary.excluded + summary.excludedByRule}
            label={t("stats.skipped")}
          />
          <Count value={summary.review} label={t("stats.toCheck")} />
        </div>
        {summary.pending > 0 && (
          <span className="text-primary text-[11px]">
            {t("pending.summary", { count: summary.pending })}
          </span>
        )}
        <span className="text-muted-foreground/80 truncate text-[11px]">
          {provenance.join(" · ")}
        </span>
      </div>
      {book && (
        <div className="ml-2 shrink-0 self-start">
          <Reprocess book={book} pending={summary.pending} />
        </div>
      )}
    </section>
  )
}
