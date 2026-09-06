"use client"

import { useMemo, useState } from "react"

import { type Clip, usePlayer } from "@v3/_/components/audio"
import { Badge } from "@v3/_/components/ui/badge"
import { Button } from "@v3/_/components/ui/button"
import { Checkbox } from "@v3/_/components/ui/checkbox"
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { type Judgment, type ReportSpineItem } from "@/alignmentReportView"
import * as icon from "@/icons"
import { type UUID } from "@/uuid"

import { TONE_BADGE, chapterClip, judgmentTone } from "./shared"
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

function matchedPercent(item: ReportSpineItem): number | null {
  if (item.kind === "unaligned") {
    return item.chapterSentenceCount ? 0 : null
  }
  return item.chapterSentenceCount > 0
    ? (item.alignedSentenceCount / item.chapterSentenceCount) * 100
    : null
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

export function ReasonBadge({
  reason,
}: {
  reason: Extract<ReportSpineItem, { kind: "unaligned" }>["reason"]
}) {
  const t = useTranslation("AlignmentReport")
  return (
    <Badge
      className={cn(
        "h-4 px-1.5 text-[10px]",
        reason === "not-found" ? TONE_BADGE.poor : TONE_BADGE.muted,
      )}
    >
      {t(`reason.${reason}`)}
    </Badge>
  )
}

function BulkBar({
  bookUuid,
  items,
  selection,
  editor,
}: {
  bookUuid: UUID
  items: ReportSpineItem[]
  selection: ReportSelection
  editor: OverrideEditor
}) {
  const t = useTranslation("AlignmentReport")
  const { playAll } = usePlayer()

  const targets = items.filter((item) => selection.checked.has(item.href))
  const clips: Clip[] = targets.flatMap((item) =>
    item.kind === "chapter"
      ? item.audio.map((audio) => chapterClip(bookUuid, item.label, audio))
      : [],
  )
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
  selection,
  editor,
}: {
  bookUuid: UUID
  items: ReportSpineItem[]
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
              (a.kind === "chapter" ? a.confidence : -1) -
                (b.kind === "chapter" ? b.confidence : -1),
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
                  item.judgment === "excluded" && "text-muted-foreground",
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
                  {item.spineIndex ?? "—"}
                </span>

                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={cn(
                      "truncate",
                      item.kind === "unaligned" && "text-muted-foreground",
                    )}
                  >
                    {item.label}
                  </span>
                  <JudgmentBadge judgment={item.judgment} />
                </span>

                <span className="flex items-center gap-2">
                  {item.kind === "chapter" ? (
                    <>
                      <span
                        className={cn(
                          "tabular-nums",
                          item.judgment !== null && "text-muted-foreground",
                        )}
                      >
                        {t("list.sentences", {
                          aligned: item.alignedSentenceCount,
                          total: item.chapterSentenceCount,
                        })}
                      </span>
                      <span className="text-muted-foreground w-5 text-right text-[10px] tabular-nums">
                        {item.confidence.toFixed(0)}
                      </span>
                    </>
                  ) : (
                    <>
                      {item.chapterSentenceCount !== null && (
                        <span className="text-muted-foreground tabular-nums">
                          {t("list.sentences", {
                            aligned: 0,
                            total: item.chapterSentenceCount,
                          })}
                        </span>
                      )}
                      <ReasonBadge reason={item.reason} />
                    </>
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
