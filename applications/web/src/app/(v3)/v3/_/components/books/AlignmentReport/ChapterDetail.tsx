"use client"

import { PlayButton, formatClock } from "@v3/_/components/audio"
import { Button } from "@v3/_/components/ui/button"
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { type ReportSpan, type ViewSpineItem } from "@/alignmentReportView"
import * as icon from "@/icons"
import { type UUID } from "@/uuid"

import { ChapterText } from "./ChapterText"
import { JudgmentBadge, StatusBadge } from "./SpineList"
import {
  TONE_TEXT,
  type Track,
  confidenceTone,
  hrefStem,
  matchedPercent,
  percentTone,
  spansOf,
  trackClip,
  trackLabel,
} from "./shared"
import { type OverrideEditor } from "./useOverrideEditor"

export function ChapterDetail({
  bookUuid,
  item,
  items,
  spans,
  tracks,
  editor,
  onBack,
  onPrev,
  onNext,
  narrow,
}: {
  bookUuid: UUID
  item: ViewSpineItem | null
  items: ViewSpineItem[]
  spans: ReportSpan[]
  tracks: Track[]
  editor: OverrideEditor
  onBack?: () => void
  onPrev?: () => void
  onNext?: () => void
  narrow: boolean
}) {
  const t = useTranslation("AlignmentReport")

  if (!item) {
    return (
      <p className="text-muted-foreground rounded-lg border p-6 text-xs">
        {t("detail.empty")}
      </p>
    )
  }

  const approved = item.judgment === "approved"
  const excluded = item.judgment === "excluded"

  return (
    <div
      className={cn("flex flex-col gap-3", !narrow && "rounded-lg border p-4")}
    >
      <div className="flex items-center gap-2">
        {onBack && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("back")}
            onClick={onBack}
          >
            <icon.ArrowLeft />
          </Button>
        )}
        <h3 className="font-heading min-w-0 truncate text-lg leading-tight font-medium">
          {item.label}
        </h3>
        <span className="text-muted-foreground shrink-0 text-[11px]">
          {item.index >= 0 && `${t("detail.spine", { index: item.index })} · `}
          {hrefStem(item.href)}
        </span>
        <JudgmentBadge judgment={item.judgment} />
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {onPrev !== undefined || onNext !== undefined ? (
            <>
              <TooltipButton
                variant="ghost"
                size="icon-sm"
                aria-label={t("detail.prev")}
                tooltip={t("detail.prev")}
                disabled={!onPrev}
                onClick={onPrev}
              >
                <icon.ChevronLeft />
              </TooltipButton>
              <TooltipButton
                variant="ghost"
                size="icon-sm"
                aria-label={t("detail.next")}
                tooltip={t("detail.next")}
                disabled={!onNext}
                onClick={onNext}
              >
                <icon.ChevronRight />
              </TooltipButton>
            </>
          ) : null}
          <TooltipButton
            variant={approved ? "secondary" : "ghost"}
            size="icon-sm"
            aria-pressed={approved}
            aria-label={t("actions.approve")}
            tooltip={t("actions.approve")}
            className={cn(approved && "text-positive")}
            onClick={() => {
              editor({
                judgments: { [item.href]: approved ? null : "approved" },
              })
            }}
          >
            <icon.Check />
          </TooltipButton>
          <TooltipButton
            variant={excluded ? "secondary" : "ghost"}
            size="icon-sm"
            aria-pressed={excluded}
            aria-label={t("actions.exclude")}
            tooltip={t("actions.exclude")}
            onClick={() => {
              editor({
                judgments: { [item.href]: excluded ? null : "excluded" },
              })
            }}
          >
            <icon.EyeOff />
          </TooltipButton>
        </div>
      </div>

      {/* {item.status === "aligned" ? ( */}
      <ChapterBody
        bookUuid={bookUuid}
        item={item}
        items={items}
        spans={spansOf(spans, item.index)}
        allSpans={spans}
        tracks={tracks}
        editor={editor}
      />
    </div>
  )
}

type TrackHull = {
  track: Track
  start: number
  end: number
  stretches: number
  interpolated: boolean
  sharedWith: { label: string; role: "before" | "after" }[]
}

function trackHulls(
  item: ViewSpineItem,
  items: ViewSpineItem[],
  spans: ReportSpan[],
  allSpans: ReportSpan[],
  tracks: Track[],
): TrackHull[] {
  const labelByIndex = new Map(items.map((entry) => [entry.index, entry.label]))
  const hulls = new Map<number, TrackHull>()
  for (const span of spans) {
    if (!span.audio) continue
    const track = tracks[span.audio.track]
    if (!track) continue
    const existing = hulls.get(track.index)
    if (existing) {
      existing.start = Math.min(existing.start, span.audio.start)
      existing.end = Math.max(existing.end, span.audio.end)
      existing.stretches += 1
      existing.interpolated ||= span.state === "interpolated"
    } else {
      hulls.set(track.index, {
        track,
        start: span.audio.start,
        end: span.audio.end,
        stretches: 1,
        interpolated: span.state === "interpolated",
        sharedWith: [],
      })
    }
  }
  for (const hull of hulls.values()) {
    const seen = new Set<number>()
    for (const span of allSpans) {
      if (
        !span.audio ||
        span.audio.track !== hull.track.index ||
        span.spine === item.index ||
        seen.has(span.spine)
      ) {
        continue
      }
      seen.add(span.spine)
      hull.sharedWith.push({
        label: labelByIndex.get(span.spine) ?? String(span.spine),
        role: span.audio.start < hull.start ? "before" : "after",
      })
    }
  }
  return [...hulls.values()].sort((a, b) => a.track.index - b.track.index)
}

function ChapterBody({
  bookUuid,
  item,
  items,
  spans,
  allSpans,
  tracks,
  editor,
}: {
  bookUuid: UUID
  item: ViewSpineItem
  items: ViewSpineItem[]
  spans: ReportSpan[]
  allSpans: ReportSpan[]
  tracks: Track[]
  editor: OverrideEditor
}) {
  const notAligned = item.status !== "aligned"

  const t = useTranslation("AlignmentReport")
  const hulls = trackHulls(item, items, spans, allSpans, tracks)
  const allAudioExcluded =
    hulls.length > 0 && hulls.every((hull) => hull.track.excluded)

  const sentencePercent =
    item.judgment === "approved" ? 100 : matchedPercent(item)
  const score = item.judgment === "approved" ? 100 : item.score
  const audioSeconds = item.matchedSeconds + item.interpolatedSeconds

  const stats = [
    {
      key: "score",
      value: (
        <span>
          {item.judgment === "approved" && item.score !== null ? (
            <span>
              <s>{item.score.toFixed(0)}</s> 100
            </span>
          ) : score === null ? (
            "—"
          ) : (
            score.toFixed(0)
          )}
        </span>
      ),
      tone: confidenceTone(score),
      icon: (
        <icon.FieldIcon
          field="alignmentConfidence"
          className={TONE_TEXT[confidenceTone(score)]}
        />
      ),
    },
    {
      key: "sentences",
      value: (
        <span>
          {item.matchedSentenceCount} /{" "}
          {item.judgment === "approved" ? (
            <span>
              <s>{item.sentenceCount}</s> {item.matchedSentenceCount}
            </span>
          ) : (
            item.sentenceCount
          )}
          {item.interpolatedSentenceCount > 0 && (
            <span className="text-muted-foreground ml-1 text-[11px] font-normal">
              {t("detail.interpolated", {
                count: item.interpolatedSentenceCount,
              })}
            </span>
          )}
          {item.droppedSentenceCount > 0 && (
            <span className="text-muted-foreground ml-1 text-[11px] font-normal">
              {t("detail.dropped", {
                count: item.droppedSentenceCount,
              })}
            </span>
          )}
        </span>
      ),
      tone: percentTone(sentencePercent),
      icon: (
        <icon.FieldIcon
          field="alignmentSentenceCoverage"
          className={TONE_TEXT[percentTone(sentencePercent)]}
        />
      ),
    },
    {
      key: "audio",
      value: formatClock(audioSeconds),
      tone: hulls.length === 0 ? ("poor" as const) : ("muted" as const),
      icon: <icon.FieldIcon field="alignmentAudioCoverage" />,
    },
  ]

  return (
    <>
      {!notAligned && (
        <div className="grid grid-cols-3 gap-3">
          {stats.map((stat) => (
            <div key={stat.key} className="flex items-center gap-1">
              {stat.icon}
              <span
                className={cn(
                  "text-base leading-none font-medium tabular-nums",
                  TONE_TEXT[stat.tone],
                )}
              >
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {hulls.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          {t("detail.noAudioFiles")}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          {hulls.map((hull) => {
            const shared = hull.sharedWith
              .map((entry) =>
                entry.role === "before"
                  ? t("detail.sharedBefore", { label: entry.label })
                  : t("detail.sharedAfter", { label: entry.label }),
              )
              .join(" · ")
            const clip = trackClip(bookUuid, hull.track, {
              start: hull.start,
              end: hull.end,
              label: item.label,
            })
            const title = [
              `${hull.track.name} · ${formatClock(hull.start)} → ${formatClock(hull.end)}`,
              t("detail.stretches", { count: hull.stretches }),
              !hull.track.present && clip ? t("detail.fromOriginal") : null,
              shared || null,
            ]
              .filter((part): part is string => part !== null)
              .join(" · ")
            return (
              <span
                key={hull.track.name}
                title={title}
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-md border py-0.5 pr-0.5 pl-0.5 text-[11px]",
                  hull.track.excluded && "text-muted-foreground",
                )}
              >
                {clip ? (
                  <PlayButton clip={clip} className="size-5" />
                ) : (
                  <span className="size-5 shrink-0" />
                )}
                <span
                  className={cn(
                    "tabular-nums",
                    hull.track.excluded && "line-through",
                  )}
                >
                  {trackLabel(hull.track)}
                </span>
                <span className="text-muted-foreground ml-1 tabular-nums">
                  {formatClock(hull.end - hull.start)}
                </span>
                {shared && (
                  <icon.Link className="text-muted-foreground ml-0.5 size-2.5" />
                )}
                <TooltipButton
                  variant="ghost"
                  size="icon-xs"
                  className="size-5"
                  aria-label={
                    hull.track.excluded
                      ? t("actions.includeFile")
                      : t("actions.excludeFile")
                  }
                  tooltip={
                    hull.track.excluded
                      ? t("actions.includeFile")
                      : t("actions.excludeFile")
                  }
                  onClick={() => {
                    editor({
                      audio: { [hull.track.name]: !hull.track.excluded },
                    })
                  }}
                >
                  {hull.track.excluded ? <icon.Volume /> : <icon.VolumeOff />}
                </TooltipButton>
              </span>
            )
          })}
          {item.judgment === "excluded" && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                editor({
                  audio: Object.fromEntries(
                    hulls.map((hull) => [hull.track.name, !allAudioExcluded]),
                  ),
                })
              }}
            >
              {allAudioExcluded ? <icon.Volume /> : <icon.VolumeOff />}
              {allAudioExcluded
                ? t("actions.restoreAudio")
                : t("actions.excludeAudio")}
            </Button>
          )}
        </div>
      )}

      <ChapterText bookUuid={bookUuid} item={item} spans={spans} />
    </>
  )
}
