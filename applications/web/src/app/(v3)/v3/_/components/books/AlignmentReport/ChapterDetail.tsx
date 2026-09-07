"use client"

import { PlayButton, formatClock } from "@v3/_/components/audio"
import { Button } from "@v3/_/components/ui/button"
import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import {
  type ReportChapterItem,
  type ReportSpineItem,
  type ReportUnalignedItem,
} from "@/alignmentReportView"
import * as icon from "@/icons"
import { type UUID } from "@/uuid"

import { ChapterText } from "./ChapterText"
import { JudgmentBadge, ReasonBadge } from "./SpineList"
import {
  TONE_TEXT,
  chapterClip,
  confidenceTone,
  hrefStem,
  percentTone,
} from "./shared"
import { type OverrideEditor } from "./useOverrideEditor"

export function ChapterDetail({
  bookUuid,
  item,
  editor,
  onBack,
  onPrev,
  onNext,
  narrow,
}: {
  bookUuid: UUID
  item: ReportSpineItem | null
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
          {item.spineIndex !== null &&
            `${t("detail.spine", { index: item.spineIndex })} · `}
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

      {item.kind === "chapter" ? (
        <ChapterBody bookUuid={bookUuid} item={item} editor={editor} />
      ) : (
        <UnalignedBody item={item} />
      )}
    </div>
  )
}

function ChapterBody({
  bookUuid,
  item,
  editor,
}: {
  bookUuid: UUID
  item: ReportChapterItem
  editor: OverrideEditor
}) {
  const t = useTranslation("AlignmentReport")
  const allAudioExcluded =
    item.audio.length > 0 && item.audio.every((audio) => audio.excluded)

  const sentencePercent =
    item.judgment === "approved"
      ? 100
      : (item.alignedSentenceCount / item.chapterSentenceCount) * 100

  const confidence = item.judgment === "approved" ? 100 : item.confidence
  const stats = [
    {
      key: "confidence",
      value: (
        <span>
          {item.judgment === "approved" ? (
            <span>
              {" "}
              <s>{item.confidence.toFixed(0)}</s> {confidence.toFixed(0)}{" "}
            </span>
          ) : (
            confidence.toFixed(0)
          )}{" "}
        </span>
      ),
      tone: confidenceTone(confidence),
      // label: t("detail.confidence"),
      icon: (
        <icon.FieldIcon
          field="alignmentConfidence"
          className={TONE_TEXT[confidenceTone(confidence)]}
        />
      ),
    },
    {
      key: "sentences",
      value: (
        <span>
          {item.alignedSentenceCount} /{" "}
          {item.judgment === "approved" ? (
            <span>
              <s>{item.chapterSentenceCount} </s> {item.alignedSentenceCount}
            </span>
          ) : (
            item.chapterSentenceCount
          )}
        </span>
      ),
      tone: percentTone(sentencePercent),
      // label: t("detail.missing", { count: missing }),
      icon: (
        <icon.FieldIcon
          field="alignmentSentenceCoverage"
          className={TONE_TEXT[percentTone(sentencePercent)]}
        />
      ),
    },
    {
      key: "audio",
      value: formatClock(item.audioSeconds),
      tone: item.audio.length === 0 ? ("poor" as const) : ("muted" as const),
      // label: t("detail.files", { count: item.audio.length }),
      icon: <icon.FieldIcon field="alignmentAudioCoverage" />,
    },
    // {
    //   key: "perSentence",
    //   value: perSentence === null ? "—" : `${perSentence.toFixed(1)} s`,
    //   tone: "muted" as const,
    //   label: t("detail.perSentence"),
    // },
  ]

  return (
    <>
      <div className={cn("grid gap-3", "grid-cols-3")}>
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

      {item.audio.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          {t("detail.noAudioFiles")}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          {item.audio.map((audio) => {
            const shared = audio.sharedWith
              .map((entry) =>
                entry.role === "before"
                  ? t("detail.sharedBefore", { label: entry.label })
                  : t("detail.sharedAfter", { label: entry.label }),
              )
              .join(" · ")
            return (
              <span
                key={`${audio.name}-${audio.start}`}
                title={`${audio.name} · ${formatClock(audio.start)} → ${formatClock(audio.end)}${shared ? ` · ${shared}` : ""}`}
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-md border py-0.5 pr-0.5 pl-0.5 text-[11px]",
                  audio.excluded && "text-muted-foreground",
                )}
              >
                <PlayButton
                  clip={chapterClip(bookUuid, item.label, audio)}
                  className="size-5"
                />
                <span
                  className={cn(
                    "tabular-nums",
                    audio.excluded && "line-through",
                  )}
                >
                  {hrefStem(audio.name)}
                </span>
                <span className="text-muted-foreground ml-1 tabular-nums">
                  {formatClock(audio.duration)}
                </span>
                {shared && (
                  <icon.Link className="text-muted-foreground ml-0.5 size-2.5" />
                )}
                <TooltipButton
                  variant="ghost"
                  size="icon-xs"
                  className="size-5"
                  aria-label={
                    audio.excluded
                      ? t("actions.includeFile")
                      : t("actions.excludeFile")
                  }
                  tooltip={
                    audio.excluded
                      ? t("actions.includeFile")
                      : t("actions.excludeFile")
                  }
                  onClick={() => {
                    editor({ audio: { [audio.name]: !audio.excluded } })
                  }}
                >
                  {audio.excluded ? <icon.Volume /> : <icon.VolumeOff />}
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
                    item.audio.map((audio) => [audio.name, !allAudioExcluded]),
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

      <ChapterText bookUuid={bookUuid} item={item} />
    </>
  )
}

function UnalignedBody({ item }: { item: ReportUnalignedItem }) {
  const t = useTranslation("AlignmentReport")
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <ReasonBadge reason={item.reason} />
        {item.chapterSentenceCount !== null && (
          <span className="text-muted-foreground text-xs tabular-nums">
            {t("detail.sentenceCount", { count: item.chapterSentenceCount })}
          </span>
        )}
      </div>
      {item.preview && (
        <p className="text-muted-foreground bg-muted/40 rounded-md p-3 text-xs leading-relaxed italic">
          {item.preview}
        </p>
      )}
    </>
  )
}
