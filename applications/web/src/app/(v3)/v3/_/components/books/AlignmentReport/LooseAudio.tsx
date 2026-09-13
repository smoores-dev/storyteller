"use client"

import { useMemo, useState } from "react"

import { PlayButton, formatClock } from "@v3/_/components/audio"
import { Badge } from "@v3/_/components/ui/badge"
import { Button } from "@v3/_/components/ui/button"
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { type ReportSpan, type ViewSpineItem } from "@/alignmentReportView"
import * as icon from "@/icons"
import { type UUID } from "@/uuid"

import {
  TONE_BADGE,
  type Track,
  rangeExcluded,
  trackClip,
  trackLabel,
} from "./shared"
import { type DecisionEditor } from "./useDecisionEditor"

const SHORT_SECONDS = 5
const GAP_SECONDS = 1

type LooseRow = {
  track: Track
  start: number
  end: number
  before: string | null
  after: string | null
}

export function looseRows(
  tracks: Track[],
  spans: ReportSpan[],
  items: ViewSpineItem[],
): LooseRow[] {
  const labelByIndex = new Map(items.map((item) => [item.index, item.label]))
  const rows: LooseRow[] = []
  for (const track of tracks) {
    const covered = spans
      .filter((span) => span.audio?.track === track.index)
      .toSorted((a, b) => (a.audio?.start ?? 0) - (b.audio?.start ?? 0))
    let cursor = 0
    let before: string | null = null
    const push = (end: number, after: string | null) => {
      if (end - cursor >= GAP_SECONDS) {
        rows.push({ track, start: cursor, end, before, after })
      }
    }
    for (const span of covered) {
      if (!span.audio) continue
      const label = labelByIndex.get(span.spine) ?? null
      push(span.audio.start, label)
      cursor = Math.max(cursor, span.audio.end)
      before = label
    }
    push(track.duration, null)
  }
  return rows.sort((a, b) => b.end - b.start - (a.end - a.start))
}

export function LooseAudio({
  bookUuid,
  items,
  spans,
  tracks,
  editor,
  narrow,
}: {
  bookUuid: UUID
  items: ViewSpineItem[]
  spans: ReportSpan[]
  tracks: Track[]
  editor: DecisionEditor
  narrow: boolean
}) {
  const t = useTranslation("AlignmentReport")
  const [showShort, setShowShort] = useState(false)
  const rows = useMemo(
    () => looseRows(tracks, spans, items),
    [tracks, spans, items],
  )

  if (rows.length === 0) return null

  const totalSeconds = rows.reduce((sum, row) => sum + (row.end - row.start), 0)
  const long = rows.filter((row) => row.end - row.start >= SHORT_SECONDS)
  const shortCount = rows.length - long.length
  const visible = showShort ? rows : long

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <h2 className="font-heading text-sm font-medium">{t("loose.title")}</h2>
        <span className="text-muted-foreground text-xs tabular-nums">
          {t("loose.count", {
            count: rows.length,
            duration: formatClock(totalSeconds),
          })}
        </span>
        {shortCount > 0 && (
          <Button
            variant="link"
            size="xs"
            className="text-muted-foreground ml-auto h-auto px-0"
            onClick={() => {
              setShowShort((value) => !value)
            }}
          >
            {showShort
              ? t("loose.hideShort", {
                  count: shortCount,
                  seconds: SHORT_SECONDS,
                })
              : t("loose.showShort", {
                  count: shortCount,
                  seconds: SHORT_SECONDS,
                })}
          </Button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border p-3 text-xs">
          {t("loose.onlyShort", { seconds: SHORT_SECONDS })}
        </p>
      ) : (
        <div className="divide-border divide-y overflow-hidden rounded-lg border">
          {visible.map(({ track, start, end, before, after }) => {
            const hint =
              before && after
                ? t("loose.between", { before, after })
                : after
                  ? t("loose.beforeFirst", { label: after })
                  : before
                    ? t("loose.afterLast", { label: before })
                    : null
            const clip = trackClip(bookUuid, track, { start, end, label: hint })
            const excluded = rangeExcluded(track, start, end)
            const range = { track: track.name, start, end }
            return (
              <div
                key={`${track.name}-${start}`}
                className={cn(
                  "flex items-center gap-2 px-2 py-1 text-xs",
                  excluded && "text-muted-foreground",
                )}
              >
                {clip ? (
                  <PlayButton clip={clip} />
                ) : (
                  <span className="size-7 shrink-0" />
                )}
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-baseline gap-1.5">
                    <span
                      className={cn(
                        "shrink-0 tabular-nums",
                        excluded && "line-through",
                      )}
                    >
                      {trackLabel(track)}
                    </span>
                    <span className="text-muted-foreground shrink-0 tabular-nums">
                      {formatClock(start)} → {formatClock(end)}
                    </span>
                  </span>
                  {!narrow && (
                    <span className="text-muted-foreground truncate text-[10px]">
                      {clip ? hint : t("loose.notOnDisk")}
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground ml-auto shrink-0 tabular-nums">
                  {formatClock(end - start)}
                </span>
                {excluded && (
                  <Badge
                    className={cn("h-4 px-1.5 text-[10px]", TONE_BADGE.muted)}
                  >
                    {t("judgment.excluded")}
                  </Badge>
                )}
                <TooltipButton
                  variant="ghost"
                  size="icon-xs"
                  aria-label={
                    excluded
                      ? t("actions.restoreStretch")
                      : t("actions.excludeStretch")
                  }
                  tooltip={
                    excluded
                      ? t("actions.restoreStretch")
                      : t("actions.excludeStretch")
                  }
                  onClick={() => {
                    editor(
                      excluded
                        ? { restoreRanges: [range] }
                        : { excludeRanges: [range] },
                    )
                  }}
                >
                  {excluded ? <icon.Volume /> : <icon.VolumeOff />}
                </TooltipButton>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
