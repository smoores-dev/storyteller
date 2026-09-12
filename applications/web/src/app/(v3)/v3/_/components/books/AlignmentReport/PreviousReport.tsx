"use client"

import { Button } from "@v3/_/components/ui/button"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import {
  type AlignmentReportSummary,
  type PreviousReport as PreviousReportData,
} from "@/alignmentReportView"
import { useFormatDate } from "@/app/(v3)/v3/_/lib/formatters"
import { ALIGNMENT_GRADES } from "@/fields"
import * as icon from "@/icons"
import { type UUID } from "@/uuid"

import {
  type ReportTone,
  TONE_TEXT,
  TONE_TILE,
  bandTone,
  confidenceTone,
  engineLabel,
  percentTone,
} from "./shared"

function Delta({
  label,
  value,
  current,
  unit,
  tone,
}: {
  label: string
  value: number | null
  current: number | null
  unit: string
  tone: ReportTone
}) {
  const t = useTranslation("AlignmentReport")
  const delta =
    value !== null && current !== null
      ? Math.round(current) - Math.round(value)
      : null

  return (
    <span className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className={cn("text-sm font-medium tabular-nums", TONE_TEXT[tone])}>
        {value === null ? "—" : `${Math.round(value)}${unit}`}
      </span>
      <span className="text-muted-foreground text-xs">{label}</span>
      {delta !== null && (
        <span
          title={t("previous.now", {
            value: `${Math.round(current ?? 0)}${unit}`,
          })}
          className={cn(
            "text-[11px] tabular-nums",
            delta > 0 && "text-good",
            delta < 0 && "text-poor",
            delta === 0 && "text-muted-foreground/70",
          )}
        >
          {delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : "±0"}
        </span>
      )}
    </span>
  )
}

export function PreviousReport({
  previous,
  summary,
  narrow,
  onOpen,
  onHide,
}: {
  previous: PreviousReportData
  summary: AlignmentReportSummary
  narrow: boolean
  onOpen: (reportUuid: UUID) => void
  onHide: () => void
}) {
  const t = useTranslation("AlignmentReport")
  const formatDate = useFormatDate()
  const tone = bandTone(ALIGNMENT_GRADES.indexOf(previous.grade))

  const provenance = [
    formatDate(previous.createdAt),
    engineLabel(previous.job?.config ?? null),
    previous.job?.config?.language ?? null,
  ].filter((part): part is string => part !== null)

  return (
    <section
      className={cn(
        "bg-card/60 flex w-fit max-w-full items-center gap-3 rounded-lg border border-dashed px-3 py-2",
        narrow && "w-full",
      )}
    >
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md border text-base opacity-80",
          TONE_TILE[tone],
        )}
      >
        <span className="font-heading leading-none font-medium">
          {previous.grade}
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-1 text-xs font-medium">
            <icon.History className="text-muted-foreground size-3.5" />
            {t("previous.title")}
          </h2>
          {previous.hasReport ? (
            <button
              type="button"
              onClick={() => {
                onOpen(previous.reportUuid)
              }}
              className="text-muted-foreground hover:text-primary inline-flex items-center gap-1 text-[11px] hover:underline"
            >
              <icon.ArrowUpRight className="size-3" />
              {t("previous.open")}
            </button>
          ) : (
            <span className="text-muted-foreground/70 text-[11px]">
              {t("previous.pruned")}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
          <Delta
            label={t("stats.sentences")}
            value={previous.sentenceCoverage}
            current={summary.sentenceCoverage}
            unit="%"
            tone={percentTone(previous.sentenceCoverage)}
          />
          <Delta
            label={t("stats.audio")}
            value={previous.audioCoverage}
            current={summary.audioCoverage}
            unit="%"
            tone={percentTone(previous.audioCoverage)}
          />
          <Delta
            label={t("stats.confidence")}
            value={previous.confidence}
            current={summary.confidence}
            unit=""
            tone={confidenceTone(previous.confidence)}
          />
        </div>
        <span className="text-muted-foreground/80 truncate text-[11px]">
          {provenance.join(" · ")}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        className="ml-1 shrink-0 self-start"
        aria-label={t("previous.hide")}
        title={t("previous.hide")}
        onClick={onHide}
      >
        <icon.Close />
      </Button>
    </section>
  )
}
