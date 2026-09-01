"use client"

import { useMemo, useState } from "react"

import { type Clip, PlayerDock, usePlayer } from "@v3/_/components/audio"
import { Button } from "@v3/_/components/ui/button"
import { ScrollArea } from "@v3/_/components/ui/scroll-area"
import { V3Link } from "@v3/_/components/v3-link"
import { cn } from "@v3/_/lib/utils"

import { type BookAlignmentReportView } from "@/alignmentReportView"
import { useTranslation } from "@/app/(v3)/v3/_/hooks/use-translation"
import {
  useFormatDate,
  useFormatRelativeTime,
} from "@/app/(v3)/v3/_/lib/formatters"
import { formatTimeHuman } from "@/components/reader/preferenceItems/formatTime"
import * as icon from "@/icons"
import { useGetBookAlignmentReportQuery } from "@/store/api"
import type { UUID } from "@/uuid"

import { LooseAudio } from "./LooseAudio"
import { SpineTable, chapterClip } from "./SpineTable"
import { useIgnoreEditor, useSelection } from "./shared"

export function AlignmentReportContent({
  uuid,
  compact = false,
  onClose,
  onBack,
  embedded = false,
}: {
  uuid: UUID
  compact?: boolean
  onClose?: () => void
  onBack?: () => void
  embedded?: boolean
}) {
  const { data, isLoading, isError } = useGetBookAlignmentReportQuery({ uuid })
  const t = useTranslation("AlignmentReport")

  return (
    <div className="relative flex h-full flex-col">
      {data ? (
        <ReportHeader
          view={data}
          compact={compact}
          onClose={onClose}
          onBack={onBack}
          embedded={embedded}
        />
      ) : (
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-1">
            {onBack && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={t("back")}
                onClick={onBack}
              >
                <icon.ArrowLeft className="size-4" />
              </Button>
            )}
            <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {t("title")}
            </span>
          </div>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t("close")}
              onClick={onClose}
            >
              <icon.Close className="size-4" />
            </Button>
          )}
        </header>
      )}

      {isLoading && (
        <p className="text-muted-foreground p-4 text-sm">{t("loading")}</p>
      )}
      {isError && (
        <p className="text-muted-foreground p-4 text-sm">{t("notAvailable")}</p>
      )}

      {data && <ReportBody view={data} />}

      <PlayerDock />
    </div>
  )
}

function ReportBody({ view }: { view: BookAlignmentReportView }) {
  const ignore = useIgnoreEditor(view)
  const { selected, toggle, setMany, clear } = useSelection()
  const [needsLookOnly, setNeedsLookOnly] = useState(() =>
    view.items.some((item) => item.needsLook),
  )

  const needsLookCount = view.items.filter((item) => item.needsLook).length
  const items = useMemo(
    () =>
      needsLookOnly
        ? view.items.filter((item) => item.needsLook)
        : view.items.slice(),
    [view.items, needsLookOnly],
  )
  const looseFiles = useMemo(
    () => view.audioFiles.filter((file) => !file.placed),
    [view.audioFiles],
  )

  return (
    <div className="flex flex-col gap-7 p-4">
      <Masthead view={view} />
      {/* <BulkBar
        view={view}
        selected={selected}
        ignore={ignore}
        onClear={clear}
      /> */}
      <SpineTable
        bookUuid={view.bookUuid}
        items={items}
        total={view.items.length}
        needsLookCount={needsLookCount}
        needsLookOnly={needsLookOnly}
        onNeedsLookOnlyChange={setNeedsLookOnly}
        selected={selected}
        onSelect={toggle}
        onSelectMany={setMany}
        ignore={ignore}
      />
      <LooseAudio
        bookUuid={view.bookUuid}
        files={looseFiles}
        selected={selected}
        onSelect={toggle}
        ignore={ignore}
      />
    </div>
  )
}

function BulkBar({
  view,
  selected,
  ignore,
  onClear,
}: {
  view: BookAlignmentReportView
  selected: ReadonlySet<string>
  ignore: ReturnType<typeof useIgnoreEditor>
  onClear: () => void
}) {
  const t = useTranslation("AlignmentReport")
  const { playAll } = usePlayer()

  const keys = [...selected]
  const clips: Clip[] = []
  let allIgnored = keys.length > 0

  for (const item of view.items) {
    if (!selected.has(item.href)) continue
    if (!item.ignored) allIgnored = false
    if (item.kind !== "chapter") continue
    for (const audio of item.audio) {
      clips.push(chapterClip(view.bookUuid, item.label, audio))
    }
  }
  for (const file of view.audioFiles) {
    if (!selected.has(file.filepath)) continue
    if (!file.ignored) allIgnored = false
    clips.push({
      bookUuid: view.bookUuid,
      name: file.name,
      label: file.name,
    })
  }

  if (keys.length === 0) return null

  return (
    <div className="bg-card sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
      <span className="text-sm">
        {t("bulk.selected", { count: keys.length })}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          disabled={clips.length === 0}
          onClick={() => {
            playAll(clips)
          }}
        >
          <icon.PlayerPlay /> {t("bulk.playInOrder")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            ignore(keys, true)
          }}
        >
          {t("actions.ignore")}
        </Button>
        {allIgnored && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              ignore(keys, false)
            }}
          >
            {t("actions.unignore")}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("bulk.clear")}
          onClick={onClear}
        >
          <icon.Close />
        </Button>
      </div>
    </div>
  )
}

function ReportHeader({
  view,
  compact,
  onClose,
  onBack,
  embedded,
}: {
  view: BookAlignmentReportView
  compact: boolean
  onClose?: () => void
  onBack?: () => void
  embedded?: boolean
}) {
  const t = useTranslation("AlignmentReport")
  const relativeTime = useFormatRelativeTime()
  return (
    <header className="relative px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              aria-label={t("back")}
              onClick={onBack}
            >
              <icon.ArrowLeft className="size-4" />
            </Button>
          )}
          <div className="flex flex-col">
            {!embedded && (
              <h1
                className={cn(
                  "font-heading font-medium",
                  compact ? "text-base" : "text-xl",
                )}
              >
                {view.bookTitle ?? t("untitled")}
              </h1>
            )}
          </div>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label={t("close")}
            onClick={onClose}
          >
            <icon.Close className="size-4" />
          </Button>
        )}

        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <V3Link
            href={`/books/${view.bookUuid}?report=true`}
            className="hover:text-primary inline-flex items-center gap-1 hover:underline"
          >
            <icon.ExternalLink className="size-3.5" /> {t("openFullPage")}
          </V3Link>
          {!embedded && (
            <V3Link
              href={`/books/${view.bookUuid}`}
              className="hover:text-primary inline-flex items-center gap-1 hover:underline"
            >
              <icon.Book className="size-3.5" /> {t("openBook")}
            </V3Link>
          )}
          {view.jobUuid && (
            <V3Link
              href="/settings?tab=queue"
              className="hover:text-primary inline-flex items-center gap-1 hover:underline"
            >
              <icon.Briefcase className="size-3.5" />{" "}
              {t("createdByJob", {
                relativeTime: relativeTime(view.createdAt, { now: new Date() }),
              })}
            </V3Link>
          )}
        </div>
      </div>
    </header>
  )
}

type GradeTone = "positive" | "good" | "moderate" | "poor"

function bandTone(band: number): GradeTone {
  if (band <= 1) return "positive"
  if (band <= 3) return "good"
  if (band === 4) return "moderate"
  return "poor"
}

const TILE_TONE: Record<GradeTone, string> = {
  positive:
    "border-positive-border bg-positive-bg text-positive dark:border-positive-900 dark:bg-positive-950/40 dark:text-positive-300",
  good: "border-good-border bg-good-bg text-good dark:border-good-900 dark:bg-good-950/40 dark:text-good-300",
  moderate:
    "border-moderate-border bg-moderate-bg text-moderate dark:border-moderate-900 dark:bg-moderate-950/40 dark:text-moderate-300",
  poor: "border-poor-border bg-poor-bg text-poor dark:border-poor-900 dark:bg-poor-950/40 dark:text-poor-300",
}

const TILE_GLOW: Record<GradeTone, string> = {
  positive:
    "from-positive-bg/70 dark:from-positive-500/50 dark:to-positive-bg/50",
  good: "from-good-bg/70 dark:from-good-500/50 dark:to-good-bg/50",
  moderate:
    "from-moderate-bg/70 dark:from-moderate-500/50 dark:to-moderate-bg/50",
  poor: "from-poor-bg/70 dark:from-poor-500/50 dark:to-poor-bg/50",
}

const MARK_TONE = {
  positive: "text-positive dark:text-positive-bg",
  good: "text-good dark:text-good-bg",
  moderate: "text-moderate dark:text-moderate-bg",
  poor: "text-poor dark:text-poor-bg",
  muted: "text-foreground",
} as const

type MarkTone = keyof typeof MARK_TONE

const VERDICT_KEYS = [
  "verdict.excellent",
  "verdict.strong",
  "verdict.good",
  "verdict.fair",
  "verdict.rough",
  "verdict.patchy",
  "verdict.failed",
] as const

function scoreTone(score: number | null): MarkTone {
  if (score === null) return "muted"
  if (score >= 95) return "positive"
  if (score >= 90) return "good"
  if (score >= 80) return "moderate"
  return "poor"
}

function Masthead({ view }: { view: BookAlignmentReportView }) {
  const { summary } = view
  const tone = bandTone(summary.band)
  const t = useTranslation("AlignmentReport")
  const formatDate = useFormatDate()

  const lead = t(VERDICT_KEYS[summary.band] ?? "verdict.failed")

  const parts: string[] = [
    summary.score === null
      ? t.plain("verdict.noScore")
      : t.plain("verdict.score", {
          score: summary.score.toFixed(1),
          sentences: summary.sentencesTotal,
        }),
  ]
  if (summary.notFoundBody > 0) {
    parts.push(t.plain("verdict.notFound", { count: summary.notFoundBody }))
  }
  if (summary.looseAudio > 0) {
    parts.push(t.plain("verdict.looseAudio", { count: summary.looseAudio }))
  }
  if (summary.ignored > 0) {
    parts.push(t.plain("verdict.ignored", { count: summary.ignored }))
  }

  const sentencePct =
    summary.sentencesTotal > 0
      ? Math.round((summary.sentencesAligned / summary.sentencesTotal) * 100)
      : null

  const needsLookParts: string[] = []
  if (summary.noAudio > 0) {
    needsLookParts.push(
      t.plain("stats.needsNoAudio", { count: summary.noAudio }),
    )
  }
  if (summary.notFoundBody > 0) {
    needsLookParts.push(
      t.plain("stats.needsNotFound", { count: summary.notFoundBody }),
    )
  }

  const boxes: {
    key: string
    label: React.ReactNode
    value: string
    sub?: React.ReactNode
    extra?: React.ReactNode
    tone: MarkTone
    percent: number | null
  }[] = [
    {
      key: "score",
      label: t("stats.score"),
      value: summary.score === null ? "—" : summary.score.toFixed(1),
      sub: t("stats.scoreSub"),
      tone: scoreTone(summary.score),
      percent:
        summary.score === null ? null : Math.round((summary.score / 100) * 100),
    },
    {
      key: "sentences",
      label: t("stats.sentences"),
      value: sentencePct === null ? "—" : `${sentencePct}%`,
      sub:
        summary.sentencesTotal > 0
          ? `${summary.sentencesAligned.toLocaleString()} / ${summary.sentencesTotal.toLocaleString()}`
          : "—",
      tone: scoreTone(sentencePct),
      percent:
        sentencePct === null ? null : Math.round((sentencePct / 100) * 100),
    },
    {
      key: "audio",
      label: t("stats.audio"),
      value: formatTimeHuman(summary.audioPlacedSeconds),
      sub: t("stats.audioOf", {
        total: formatTimeHuman(summary.audioTotalSeconds),
      }),
      extra:
        summary.looseAudio > 0
          ? t("stats.filesLoose", { count: summary.looseAudio })
          : t("stats.allPlaced"),
      tone: summary.looseAudio > 0 ? "moderate" : "muted",
      percent:
        summary.audioPlacedSeconds === null
          ? null
          : Math.round(
              (summary.audioPlacedSeconds / summary.audioTotalSeconds) * 100,
            ),
    },
    {
      key: "needsLook",
      label: t("stats.needsLook"),
      value: `${summary.needsLook}`,
      sub: needsLookParts.join(", "),
      tone: summary.needsLook > 0 ? "moderate" : "muted",
      percent: null,
    },
  ]

  return (
    <section className="bg-card overflow-hidden rounded-lg border">
      <div
        className={cn(
          "relative flex flex-wrap items-center gap-6 bg-gradient-to-br to-transparent p-6",
          TILE_GLOW[tone],
        )}
      >
        <div
          className={cn(
            "flex size-28 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border",
            TILE_TONE[tone],
          )}
        >
          <span className="font-heading text-5xl leading-none font-medium">
            {summary.grade}
          </span>
        </div>
        <div className="min-w-[16rem] flex-1">
          <h2 className="text-2xl leading-tight font-normal">{lead}</h2>
          <p className="text-muted-foreground dark:text-foreground mt-1.5 max-w-prose text-sm leading-relaxed">
            {parts.join(" ")}
          </p>
          <p className="text-muted-foreground dark:text-foreground/80 mt-2.5 font-mono text-[11px]">
            {t("lastGraded", { date: formatDate(view.createdAt) })}
          </p>
        </div>
      </div>

      <div className="bg-border grid grid-cols-2 gap-px border-t @sm/book:grid-cols-4">
        {boxes.map((box) => (
          <div key={box.key} className="bg-card relative p-3.5">
            <div
              className={cn(
                "text-xl leading-none font-medium tabular-nums",
                MARK_TONE[box.tone],
              )}
            >
              {box.value}
            </div>
            <div className="text-muted-foreground mt-1.5 text-[10px] tracking-wide uppercase">
              {box.label}
            </div>
            {box.sub && (
              <div className="text-muted-foreground/80 mt-0.5 font-mono text-[10px] tabular-nums">
                {box.sub}
              </div>
            )}
            {box.extra && (
              <div className="text-muted-foreground/70 mt-0.5 text-[10px]">
                {box.extra}
              </div>
            )}
            {box.percent !== null && (
              <div
                className={cn(
                  "text-muted-foreground absolute bottom-0 left-0 z-10 h-1 text-center text-xs",
                  box.tone !== "muted" ? TILE_TONE[box.tone] : "",
                )}
                style={{
                  width: `${box.percent}%`,
                }}
              ></div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
