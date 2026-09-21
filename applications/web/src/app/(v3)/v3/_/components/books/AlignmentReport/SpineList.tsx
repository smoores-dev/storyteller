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
  type ReportTone,
  TONE_BADGE,
  type Track,
  itemTone,
  judgmentTone,
  matchedPercent,
  needsListen,
  ruleSignal,
  skippedByRule,
  trackClip,
} from "./shared"
import { type DecisionEditor } from "./useDecisionEditor"
import { type ReportSelection } from "./useReportSelection"

function rowFillStyle(percent: number | null, tone: ReportTone) {
  if (percent === null || percent <= 0) return undefined
  const stop = `${Math.min(percent, 100).toFixed(1)}%`
  const fill = `color-mix(in oklab, var(--${tone}) 22%, transparent)`
  return {
    backgroundImage: `linear-gradient(to right, ${fill} ${stop}, transparent ${stop})`,
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

export function StatusBadge({ item }: { item: ViewSpineItem }) {
  const t = useTranslation("AlignmentReport")
  if (item.status === "aligned") return null
  const signal = item.status === "excluded" ? ruleSignal(item) : null
  return (
    <Badge
      title={
        signal
          ? t("rule.signal", {
              source: t(`source.${signal.source}`),
              value: signal.value || t("rule.noText"),
            })
          : undefined
      }
      className={cn(
        "h-4 px-1.5 text-[10px]",
        item.status === "not-found" ? TONE_BADGE.poor : TONE_BADGE.muted,
      )}
    >
      {t(`reason.${item.status}`)}
    </Badge>
  )
}

export function ListenBadge({ item }: { item: ViewSpineItem }) {
  const t = useTranslation("AlignmentReport")
  if (!needsListen(item)) return null
  const signal = ruleSignal(item)
  return (
    <Badge
      title={
        signal
          ? t("rule.signal", {
              source: t(`source.${signal.source}`),
              value: signal.value,
            })
          : undefined
      }
      className={cn("h-4 gap-0.5 px-1.5 text-[10px]", TONE_BADGE.moderate)}
    >
      <icon.Headphones className="size-2.5" />
      {t("rule.listen")}
    </Badge>
  )
}

export function PendingBadge({ item }: { item: ViewSpineItem }) {
  const t = useTranslation("AlignmentReport")
  if (!item.pending) return null
  return (
    <Badge
      title={t("pending.hint")}
      className="border-primary/40 text-primary h-4 gap-0.5 border bg-transparent px-1.5 text-[10px]"
    >
      <icon.Clock className="size-2.5" />
      {t("pending.badge")}
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
  editor: DecisionEditor
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
    <div className="bg-card sticky top-0 z-10 -mb-2 pb-2 text-xs">
      <div className="border-primary/40 bg-primary/5 flex flex-wrap items-center gap-1 rounded-md border px-2 py-1">
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
        {targets.some(skippedByRule) && (
          <TooltipButton
            variant="ghost"
            size="icon-xs"
            aria-label={t("actions.include")}
            tooltip={t("actions.includeHint")}
            onClick={() => {
              judge("included")
            }}
          >
            <icon.Eye />
          </TooltipButton>
        )}
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
  editor: DecisionEditor
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
        <p className="text-muted-foreground rounded-md border p-4 text-xs">
          {t("list.empty")}
        </p>
      ) : (
        <div className="divide-border divide-y overflow-hidden rounded-md border">
          {rows.map((item) => {
            const isChecked = selection.checked.has(item.href)
            const isOpen = item.href === selection.openHref
            const percent = matchedPercent(item)
            return (
              <div key={item.href} className="relative w-full">
                {/* <div
                  className={cn(
                    "absolute top-0 left-0 h-full",
                    item.judgment === null
                      ? rowFillStyle(percent, itemTone(item))
                      : undefined,
                  )}
                  style={{
                    width: `${percent}%`,
                  }}
                /> */}
                <Checkbox
                  checked={isChecked}
                  className="absolute top-1/2 left-2 z-20 -translate-y-1/2"
                  aria-label={item.label}
                  onClick={(event) => {
                    event.stopPropagation()
                    event.preventDefault()
                    selection.toggleChecked(item.href, event.shiftKey, order)
                  }}
                />
                <button
                  role="button"
                  tabIndex={0}
                  aria-current={isOpen}
                  onClick={() => {
                    selection.setOpenHref(item.href)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") {
                      return
                    }
                    event.preventDefault()
                    selection.setOpenHref(item.href)
                  }}
                  style={
                    item.judgment === null || item.judgment === "included"
                      ? rowFillStyle(percent, itemTone(item))
                      : undefined
                  }
                  className={cn(
                    "hover:bg-muted/40 pl-12 w-full focus-visible:ring-ring/30 relative  grid cursor-pointer grid-cols-[1rem_1.25rem_minmax(0,1fr)_auto] items-center gap-2 bg-no-repeat px-2 py-1.5 text-xs outline-none focus-visible:ring-2",
                    isOpen && "bg-muted",
                    isChecked && "bg-primary/10",
                    (item.judgment === "excluded" ||
                      item.status === "excluded") &&
                      "text-muted-foreground bg-muted",
                  )}
                >
                  <span />
                  <span className="text-muted-foreground text-right text-[10px] tabular-nums">
                    {item.index >= 0 ? item.index : "—"}
                  </span>
                  <span className="flex min-w-0 grow items-center gap-1.5">
                    <span
                      className={cn(
                        "truncate",
                        item.status !== "aligned" && "text-muted-foreground",
                      )}
                    >
                      {item.label}
                    </span>
                    <JudgmentBadge judgment={item.judgment} />
                    <ListenBadge item={item} />
                    <PendingBadge item={item} />
                  </span>

                  <span className="flex items-center gap-2">
                    {item.sentenceCount > 0 && (
                      <span
                        className={cn(
                          "tabular-nums",
                          (item.judgment !== null ||
                            item.status !== "aligned") &&
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
                    {item.status === "aligned" ? null : (
                      // <span className="text-muted-foreground w-5 text-right text-[10px] tabular-nums">
                      //   {item.score === null ? "—" : item.score.toFixed(0)}
                      // </span>
                      <StatusBadge item={item} />
                    )}
                    <icon.ChevronRight className="text-muted-foreground size-3.5" />
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
