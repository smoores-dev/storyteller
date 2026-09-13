"use client"

import { useMemo, useState } from "react"

import { PlayButton, formatClock } from "@v3/_/components/audio"
import { Badge } from "@v3/_/components/ui/badge"
import { Button } from "@v3/_/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@v3/_/components/ui/select"
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
  readStored,
  store,
  trackClip,
  trackLabel,
} from "./shared"
import { type DecisionEditor } from "./useDecisionEditor"

const SHORT_SECONDS = 5
const GAP_SECONDS = 1
const SORT_KEY = "alignment-report.loose-sort"

const SORTS = ["length", "position", "track"] as const

type LooseSort = (typeof SORTS)[number]

function parseSort(raw: string): LooseSort | null {
  return SORTS.find((sort) => sort === raw) ?? null
}

type LooseRow = {
  track: Track
  start: number
  end: number
  before: string | null
  after: string | null
}

const COMPARE: Record<LooseSort, (a: LooseRow, b: LooseRow) => number> = {
  length: (a, b) => b.end - b.start - (a.end - a.start),
  position: (a, b) => a.track.index - b.track.index || a.start - b.start,
  track: (a, b) =>
    trackLabel(a.track).localeCompare(trackLabel(b.track), undefined, {
      numeric: true,
    }) || a.start - b.start,
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
  return rows.sort(COMPARE.length)
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
  const [sort, setSort] = useState<LooseSort>(() =>
    readStored(SORT_KEY, parseSort, "length"),
  )
  const rows = useMemo(
    () => looseRows(tracks, spans, items),
    [tracks, spans, items],
  )
  const sorted = useMemo(() => rows.toSorted(COMPARE[sort]), [rows, sort])

  if (rows.length === 0) return null

  const totalSeconds = rows.reduce((sum, row) => sum + (row.end - row.start), 0)
  const shortCount = rows.filter(
    (row) => row.end - row.start < SHORT_SECONDS,
  ).length
  const visible = showShort
    ? sorted
    : sorted.filter((row) => row.end - row.start >= SHORT_SECONDS)

  const sortItems = SORTS.map((value) => ({
    value,
    label:
      value === "length"
        ? t("loose.sortByLength")
        : value === "position"
          ? t("loose.sortByPosition")
          : t("loose.sortByTrack"),
  }))

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="font-heading text-sm font-medium">{t("loose.title")}</h2>
        <span className="text-muted-foreground text-xs tabular-nums">
          {t("loose.count", {
            count: rows.length,
            duration: formatClock(totalSeconds),
          })}
        </span>
        <Select
          value={sort}
          items={sortItems}
          onValueChange={(value) => {
            const next = parseSort(String(value)) ?? "length"
            setSort(next)
            store(SORT_KEY, next)
          }}
        >
          <SelectTrigger
            size="sm"
            aria-label={t("loose.sort")}
            className="text-muted-foreground ml-auto h-6 bg-transparent px-1.5 text-[11px]"
          >
            <icon.SortDescending className="size-3" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end" alignItemWithTrigger={false}>
            {sortItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {visible.length === 0 ? (
        <p className="text-muted-foreground rounded-md border p-3 text-xs">
          {t("loose.onlyShort", { seconds: SHORT_SECONDS })}
        </p>
      ) : (
        <div className="divide-border divide-y overflow-hidden rounded-md border">
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
                  "grid grid-cols-[1.75rem_minmax(0,1fr)_auto_auto_1.5rem] items-center gap-x-1.5 px-1.5 py-1 text-xs",
                  excluded && "text-muted-foreground",
                )}
              >
                {clip ? (
                  <PlayButton clip={clip} />
                ) : (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled
                    aria-label={t("loose.unavailable")}
                    title={t("loose.unavailable")}
                  >
                    <icon.PlayerPlay />
                  </Button>
                )}
                <span className="flex min-w-0 flex-col">
                  <span
                    className={cn("truncate", excluded && "line-through")}
                    title={trackLabel(track)}
                  >
                    {trackLabel(track)}
                  </span>
                  {!narrow && (
                    <span className="text-muted-foreground truncate text-[10px]">
                      {clip ? (hint ?? track.name) : t("loose.unavailable")}
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground w-[7.5rem] text-right text-[11px] tabular-nums">
                  {formatClock(start)} → {formatClock(end)}
                </span>
                <span className="flex w-14 items-center justify-end gap-1 tabular-nums">
                  {excluded ? (
                    <Badge
                      className={cn("h-4 px-1.5 text-[10px]", TONE_BADGE.muted)}
                    >
                      {t("judgment.excluded")}
                    </Badge>
                  ) : (
                    <span>{formatClock(end - start)}</span>
                  )}
                </span>
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
      {shortCount > 0 && (
        <Button
          variant="link"
          size="xs"
          className="text-muted-foreground h-auto self-end px-0"
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
    </section>
  )
}
