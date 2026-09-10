"use client"

import { useMemo, useState } from "react"

import { type Clip, usePlayer } from "@v3/_/components/audio"
import { Badge } from "@v3/_/components/ui/badge"
import { Button } from "@v3/_/components/ui/button"
import { Checkbox } from "@v3/_/components/ui/checkbox"
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import {
  type Judgment,
  type ReportSpan,
  type ViewSpineItem,
} from "@/alignmentReportView"
import * as icon from "@/icons"
import { type UUID } from "@/uuid"

import {
  TONE_BADGE,
  type Track,
  judgmentTone,
  matchedPercent,
  trackClip,
} from "./shared"
import { type OverrideEditor } from "./useOverrideEditor"
import { type ReportSelection } from "./useReportSelection"

const ROW_FILL =
  "[--row-fill:color-mix(in_oklab,var(--color-positive)_14%,transparent)] dark:[--row-fill:color-mix(in_oklab,var(--color-positive)_22%,transparent)]"

function rowFillStyle(percent: number | null) {
  if (percent === null || percent <= 0) return undefined
  const stop = `${Math.min(percent, 100).toFixed(1)}%`
  return {
    backgroundImage: `linear-gradient(to right, var(--row-fill) ${stop}, transparent ${stop})`,
  }
}

export function JudgmentBadge({ judgment }: { judgment: Judgment | null }) {
  const t = useTranslation("AlignmentReport")
  const tone = judgmentTone(judgment)
  if (!judgment || !tone) return null
  return (
    <Badge className={cn("h-4 px-1.5 text-[10px]", TONE_BADGE[tone])}>
      {t(`judgment.${judgment}`)}
    </Badge>
  )
}

export function StatusBadge({ status }: { status: ViewSpineItem["status"] }) {
  const t = useTranslation("AlignmentReport")
  if (status === "aligned") return null
  return (
    <Badge
      className={cn(
        "h-4 px-1.5 text-[10px]",
        status === "not-found" ? TONE_BADGE.poor : TONE_BADGE.muted,
      )}
    >
      {t(`reason.${status}`)}
    </Badge>
  )
}

export function spanClips(
  bookUuid: UUID,
  items: ViewSpineItem[],
  spans: ReportSpan[],
  tracks: Track[],
): Clip[] {
  const labelByIndex = new Map(items.map((item) => [item.index, item.label]))
  const wanted = new Set(items.map((item) => item.index))
  return spans
    .filter((span) => wanted.has(span.spine) && span.audio)
    .toSorted(
      (a, b) =>
        (a.audio?.track ?? 0) - (b.audio?.track ?? 0) ||
        (a.audio?.start ?? 0) - (b.audio?.start ?? 0),
    )
    .flatMap((span) => {
      const track = span.audio ? tracks[span.audio.track] : undefined
      if (!track || !span.audio) return []
      const clip = trackClip(bookUuid, track, {
        start: span.audio.start,
        end: span.audio.end,
        label: labelByIndex.get(span.spine) ?? null,
      })
      return clip ? [clip] : []
    })
}

function BulkBar({
  bookUuid,
  items,
  spans,
  tracks,
  selection,
  editor,
}: {
  bookUuid: UUID
  items: ViewSpineItem[]
  spans: ReportSpan[]
  tracks: Track[]
  selection: ReportSelection
  editor: OverrideEditor
}) {
  const t = useTranslation("AlignmentReport")
  const { playAll } = usePlayer()

  const targets = items.filter((item) => selection.checked.has(item.href))
  const clips = spanClips(bookUuid, targets, spans, tracks)
  const judge = (judgment: Judgment | null) => {
    editor({
      judgments: Object.fromEntries(
        targets.map((item) => [item.href, judgment]),
      ),
    })
  }

  return (
    <div className="border-primary/40 bg-primary/5 flex flex-wrap items-center gap-1 rounded-lg border px-2 py-1 text-xs">
      <span className="mr-1 font-medium">
        {t("bulk.selected", { count: targets.length })}
      </span>
      <TooltipButton
        variant="ghost"
        size="icon-xs"
        aria-label={t("actions.approve")}
        tooltip={t("actions.approve")}
        onClick={() => {
          judge("approved")
        }}
      >
        <icon.Check />
      </TooltipButton>
      <TooltipButton
        variant="ghost"
        size="icon-xs"
        aria-label={t("actions.exclude")}
        tooltip={t("actions.exclude")}
        onClick={() => {
          judge("excluded")
        }}
      >
        <icon.EyeOff />
      </TooltipButton>
      <Button
        variant="ghost"
        size="xs"
        disabled={!targets.some((item) => item.judgment !== null)}
        onClick={() => {
          judge(null)
        }}
      >
        {t("actions.clearJudgment")}
      </Button>
      <TooltipButton
        variant="ghost"
        size="icon-xs"
        aria-label={t("bulk.playInOrder")}
        tooltip={t("bulk.playInOrder")}
        disabled={clips.length === 0}
        onClick={() => {
          playAll(clips)
        }}
      >
        <icon.PlayerPlay />
      </TooltipButton>
      <TooltipButton
        variant="ghost"
        size="icon-xs"
        className="ml-auto"
        aria-label={t("bulk.clear")}
        tooltip={t("bulk.clear")}
        onClick={selection.clearChecked}
      >
        <icon.Close />
      </TooltipButton>
    </div>
  )
}

export function SpineList({
  bookUuid,
  items,
  spans,
  tracks,
  selection,
  editor,
}: {
  bookUuid: UUID
  items: ViewSpineItem[]
  spans: ReportSpan[]
  tracks: Track[]
  selection: ReportSelection
  editor: OverrideEditor
}) {
  const t = useTranslation("AlignmentReport")
  const [byConfidence, setByConfidence] = useState(false)

  const rows = useMemo(
    () =>
      byConfidence
        ? items.toSorted(
            (a, b) =>
              (matchedPercent(a) ?? -1) - (matchedPercent(b) ?? -1) ||
              (a.score ?? -1) - (b.score ?? -1),
          )
        : items,
    [items, byConfidence],
  )
  const order = rows.map((item) => item.href)
  const allChecked =
    order.length > 0 && order.every((href) => selection.checked.has(href))
  const someChecked = !allChecked && selection.checked.size > 0

  return (
    <section className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <Checkbox
          checked={allChecked}
          indeterminate={someChecked}
          aria-label={allChecked ? t("list.selectNone") : t("list.selectAll")}
          onCheckedChange={(checked) => {
            selection.setManyChecked(order, checked)
          }}
        />
        <h2 className="font-heading text-sm font-medium">{t("list.title")}</h2>
        <span className="text-muted-foreground text-xs tabular-nums">
          {items.length}
        </span>
        <TooltipButton
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          aria-pressed={byConfidence}
          aria-label={
            byConfidence ? t("list.sortBySpine") : t("list.sortByMatched")
          }
          tooltip={
            byConfidence ? t("list.sortBySpine") : t("list.sortByMatched")
          }
          onClick={() => {
            setByConfidence((value) => !value)
          }}
        >
          <icon.SortAscending className={cn(byConfidence && "text-primary")} />
        </TooltipButton>
      </div>

      {selection.checked.size > 0 && (
        <BulkBar
          bookUuid={bookUuid}
          items={items}
          spans={spans}
          tracks={tracks}
          selection={selection}
          editor={editor}
        />
      )}

      {rows.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border p-4 text-xs">
          {t("list.empty")}
        </p>
      ) : (
        <div className="divide-border divide-y overflow-hidden rounded-lg border">
          {rows.map((item) => {
            const isChecked = selection.checked.has(item.href)
            const isOpen = item.href === selection.openHref
            const percent = matchedPercent(item)
            return (
              <div
                key={item.href}
                role="button"
                tabIndex={0}
                aria-current={isOpen}
                onClick={() => {
                  selection.setOpenHref(item.href)
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return
                  event.preventDefault()
                  selection.setOpenHref(item.href)
                }}
                style={
                  item.judgment === null ? rowFillStyle(percent) : undefined
                }
                className={cn(
                  "hover:bg-muted/40 focus-visible:ring-ring/30 grid cursor-pointer grid-cols-[1rem_1.25rem_minmax(0,1fr)_auto] items-center gap-2 bg-no-repeat px-2 py-1.5 text-xs outline-none focus-visible:ring-2",
                  ROW_FILL,
                  isOpen && "bg-muted",
                  isChecked && "bg-primary/10",
                  item.judgment === "excluded" &&
                    "text-muted-foreground bg-muted",
                )}
              >
                <Checkbox
                  checked={isChecked}
                  aria-label={item.label}
                  onClick={(event) => {
                    event.stopPropagation()
                    selection.toggleChecked(item.href, event.shiftKey, order)
                  }}
                />
                <span className="text-muted-foreground text-right text-[10px] tabular-nums">
                  {item.index >= 0 ? item.index : "—"}
                </span>

                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={cn(
                      "truncate",
                      item.status !== "aligned" && "text-muted-foreground",
                    )}
                  >
                    {item.label}
                  </span>
                  <JudgmentBadge judgment={item.judgment} />
                </span>

                <span className="flex items-center gap-2">
                  {item.sentenceCount > 0 && (
                    <span
                      className={cn(
                        "tabular-nums",
                        (item.judgment !== null || item.status !== "aligned") &&
                          "text-muted-foreground",
                      )}
                    >
                      {t("list.sentences", {
                        aligned: item.matchedSentenceCount,
                        total: item.sentenceCount,
                      })}
                      {item.interpolatedSentenceCount > 0 && (
                        <span className="text-muted-foreground/70 ml-0.5 text-[10px]">
                          {t("list.interpolated", {
                            count: item.interpolatedSentenceCount,
                          })}
                        </span>
                      )}
                    </span>
                  )}
                  {item.status === "aligned" ? (
                    <span className="text-muted-foreground w-5 text-right text-[10px] tabular-nums">
                      {item.score === null ? "—" : item.score.toFixed(0)}
                    </span>
                  ) : (
                    <StatusBadge status={item.status} />
                  )}
                  <icon.ChevronRight className="text-muted-foreground size-3.5" />
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
