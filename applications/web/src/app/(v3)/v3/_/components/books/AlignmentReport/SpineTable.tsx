"use client"

import { Fragment, useMemo, useRef, useState } from "react"

import { type Clip, ClipChip, PlayButton } from "@v3/_/components/audio"
import { Button } from "@v3/_/components/ui/button"
import { Checkbox } from "@v3/_/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@v3/_/components/ui/dropdown-menu"
import { Switch } from "@v3/_/components/ui/switch"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import {
  type MatchContext,
  type ReportChapterAudio,
  type ReportChapterItem,
  type ReportSpineItem,
} from "@/alignmentReportView"
import { formatTimeHuman } from "@/components/reader/preferenceItems/formatTime"
import * as icon from "@/icons"
import type { UUID } from "@/uuid"

import { FlagBadge, type IgnoreEditor, shortHref } from "./shared"

export function chapterClip(
  bookUuid: UUID,
  label: string,
  audio: ReportChapterAudio,
): Clip {
  return {
    bookUuid,
    name: audio.name,
    start: audio.start,
    end: audio.end,
    label,
    sublabel: audio.name,
  }
}

function scoreTone(score: number): string {
  if (score >= 95) return "bg-positive/80"
  if (score >= 85) return "bg-good/80"
  return "bg-poor/80"
}

function Meter({ value, className }: { value: number; className?: string }) {
  const pct = Math.min(Math.max(value, 0), 100)
  return (
    <div
      className={cn(
        "bg-muted h-1 w-8 shrink-0 overflow-hidden rounded-full",
        className,
      )}
    >
      <div
        className={cn("h-full rounded-full", scoreTone(pct))}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function ChapterFigures({ item }: { item: ReportChapterItem }) {
  const t = useTranslation("AlignmentReport")
  const total = item.chapterSentenceCount
  const coverage =
    total > 0 ? Math.round((item.alignedSentenceCount / total) * 100) : 100
  return (
    <>
      <span className="flex w-16 items-center gap-1.5 tabular-nums">
        {item.score.toFixed(1)}
        <Meter value={item.score} />
      </span>
      <span className="flex w-24 items-center gap-1.5 tabular-nums">
        <span>
          {item.alignedSentenceCount}/{total}
        </span>
        {item.missing > 0 ? (
          <span className="text-poor text-[10px]">−{item.missing}</span>
        ) : (
          <Meter value={coverage} className="w-4" />
        )}
      </span>
      <span className="text-muted-foreground flex w-14 items-center justify-end gap-1 tabular-nums">
        {item.audioSeconds > 0 ? formatTimeHuman(item.audioSeconds) : "—"}
      </span>
      <span className="flex min-w-16 flex-wrap justify-end gap-1">
        {item.ignored && <FlagBadge tone="info">{t("ignored")}</FlagBadge>}
        {item.status === "no-audio" && (
          <FlagBadge tone="poor">{t("status.no-audio")}</FlagBadge>
        )}
        {item.durationSuspicious && (
          <FlagBadge tone="moderate">{t("table.rangeSuspicious")}</FlagBadge>
        )}
      </span>
    </>
  )
}

function UnalignedFigures({
  item,
}: {
  item: Extract<ReportSpineItem, { kind: "unaligned" }>
}) {
  const t = useTranslation("AlignmentReport")
  return (
    <>
      <span className="text-muted-foreground w-16 tabular-nums">—</span>
      <span className="text-muted-foreground w-24 tabular-nums">
        {item.chapterSentenceCount == null
          ? "—"
          : `0/${item.chapterSentenceCount}`}
      </span>
      <span className="text-muted-foreground w-14 text-right">—</span>
      <span className="flex min-w-16 flex-wrap justify-end gap-1">
        {item.ignored && <FlagBadge tone="info">{t("ignored")}</FlagBadge>}
        <FlagBadge tone={item.reason === "not-found" ? "poor" : "info"}>
          {t(`reason.${item.reason}`)}
        </FlagBadge>
        {item.hint && <FlagBadge>{t(`hint.${item.hint}`)}</FlagBadge>}
      </span>
    </>
  )
}

function RowMenu({
  item,
  ignore,
}: {
  item: ReportSpineItem
  ignore: IgnoreEditor
}) {
  const t = useTranslation("AlignmentReport")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("actions.menu")}
            onClick={(event) => {
              event.stopPropagation()
            }}
          >
            <icon.Dots className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => {
            ignore([item.href], !item.ignored)
          }}
        >
          {item.ignored ? t("actions.unignore") : t("actions.ignore")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SpineRow({
  bookUuid,
  item,
  expanded,
  onToggleExpanded,
  checked,
  onCheck,
  ignore,
}: {
  bookUuid: UUID
  item: ReportSpineItem
  expanded: boolean
  onToggleExpanded: () => void
  checked: boolean
  onCheck: (extend: boolean) => void
  ignore: IgnoreEditor
}) {
  const shift = useRef(false)
  const stem = shortHref(item.href)
  return (
    <li
      className={cn(
        "border-t",
        item.needsLook && "border-l-moderate-border/80 border-l-2",
        item.kind === "unaligned" && "opacity-70",
        item.ignored && "opacity-45",
        checked && "bg-primary/5",
      )}
    >
      <div
        className={cn(
          "hover:bg-muted/40 flex items-start gap-3 px-2 py-2",
          item.kind === "chapter" && "cursor-pointer",
        )}
        onClick={item.kind === "chapter" ? onToggleExpanded : undefined}
      >
        <Checkbox
          className="mt-1"
          checked={checked}
          aria-label={item.label}
          onClick={(event) => {
            event.stopPropagation()
            shift.current = event.shiftKey
          }}
          onCheckedChange={() => {
            onCheck(shift.current)
          }}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="flex min-w-0 flex-1 items-baseline gap-2">
              <span className="font-heading truncate font-medium">
                {item.label}
              </span>
              {stem !== item.label && (
                <span className="text-muted-foreground shrink-0 font-mono text-[10px]">
                  {stem}
                </span>
              )}
            </span>
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              {item.kind === "chapter" ? (
                <ChapterFigures item={item} />
              ) : (
                <UnalignedFigures item={item} />
              )}
            </span>
          </div>
          {item.kind === "chapter" && item.audio.length > 0 && (
            <div
              className="flex flex-wrap items-center gap-1"
              onClick={(event) => {
                event.stopPropagation()
              }}
            >
              {item.audio.map((audio) => (
                <ClipChip
                  key={`${audio.filepath}-${audio.start}`}
                  clip={chapterClip(bookUuid, item.label, audio)}
                />
              ))}
            </div>
          )}
          {item.kind === "unaligned" && item.preview && (
            <span className="text-muted-foreground/80 truncate text-xs italic">
              {item.preview}
            </span>
          )}
        </div>
        <RowMenu item={item} ignore={ignore} />
      </div>
      {expanded && item.kind === "chapter" && (
        <div className="bg-muted/20 border-t px-2 py-2">
          <ChapterDetail bookUuid={bookUuid} item={item} />
        </div>
      )}
    </li>
  )
}

export function SpineTable({
  bookUuid,
  items,
  total,
  needsLookCount,
  needsLookOnly,
  onNeedsLookOnlyChange,
  selected,
  onSelect,
  onSelectMany,
  ignore,
}: {
  bookUuid: UUID
  items: ReportSpineItem[]
  total: number
  needsLookCount: number
  needsLookOnly: boolean
  onNeedsLookOnlyChange: (value: boolean) => void
  selected: ReadonlySet<string>
  onSelect: (key: string, order: readonly string[], extend: boolean) => void
  onSelectMany: (keys: readonly string[], on: boolean) => void
  ignore: IgnoreEditor
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const [sortByScore, setSortByScore] = useState(false)
  const t = useTranslation("AlignmentReport")
  const tCommon = useTranslation("Common")

  const rows = useMemo(
    () =>
      sortByScore
        ? items.toSorted(
            (a, b) =>
              (a.kind === "chapter" ? a.score : -1) -
              (b.kind === "chapter" ? b.score : -1),
          )
        : items,
    [items, sortByScore],
  )
  const order = rows.map((item) => item.href)
  const all = order.length > 0 && order.every((key) => selected.has(key))
  const some = !all && order.some((key) => selected.has(key))

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-normal">
          {tCommon("Nouns.chapter", { count: items.length })}{" "}
          <span className="text-muted-foreground font-mono text-xs">
            ({tCommon("outOf", { count: items.length, total })})
          </span>
        </h2>
        {needsLookCount > 0 && (
          <label
            htmlFor="needs-look-only"
            className="text-muted-foreground flex cursor-pointer items-center gap-2 text-xs"
          >
            {t("table.needsLookOnly")}
            <Switch
              id="needs-look-only"
              checked={needsLookOnly}
              onCheckedChange={onNeedsLookOnlyChange}
            />
          </label>
        )}
      </div>

      <div className="text-muted-foreground flex items-center gap-3 px-2 text-xs">
        <Checkbox
          checked={all}
          indeterminate={some}
          aria-label={t("table.selectAll")}
          onCheckedChange={(checked) => {
            onSelectMany(order, checked)
          }}
        />
        <span className="flex-1">{t("table.columns.chapter")}</span>
        <button
          type="button"
          className="hover:text-foreground inline-flex items-center gap-1"
          onClick={() => {
            setSortByScore((value) => !value)
          }}
        >
          {t("table.columns.score")}
          {sortByScore ? (
            <icon.SortAscending className="size-3" />
          ) : (
            <icon.ArrowsSort className="size-3 opacity-40" />
          )}
        </button>
        <span className="w-24">{t("table.columns.sentences")}</span>
        <span className="w-14 text-right">{t("table.columns.length")}</span>
        <span className="min-w-16 text-right">{t("table.columns.status")}</span>
        <span className="w-7" />
      </div>

      <ul className="rounded-lg text-sm">
        {rows.map((item) => (
          <SpineRow
            key={item.href}
            bookUuid={bookUuid}
            item={item}
            expanded={expanded.has(item.href)}
            onToggleExpanded={() => {
              setExpanded((prev) => {
                const next = new Set(prev)
                if (next.has(item.href)) next.delete(item.href)
                else next.add(item.href)
                return next
              })
            }}
            checked={selected.has(item.href)}
            onCheck={(extend) => {
              onSelect(item.href, order, extend)
            }}
            ignore={ignore}
          />
        ))}
      </ul>
    </section>
  )
}

function ChapterDetail({
  bookUuid,
  item,
}: {
  bookUuid: UUID
  item: ReportChapterItem
}) {
  const t = useTranslation("AlignmentReport")
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <MatchCard
          label={t("detail.firstMatch")}
          ebook={item.firstMatch}
          transcript={item.transcriptionContext}
        />
        <MatchCard
          label={t("detail.lastMatch")}
          ebook={item.lastMatch}
          transcript={item.endTranscriptionContext}
        />
      </div>
      {item.audio.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          {t("detail.noAudioFiles")}
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {item.audio.map((audio) => (
            <li
              key={`${audio.filepath}-${audio.start}`}
              className="flex items-center gap-2 text-xs"
            >
              <PlayButton clip={chapterClip(bookUuid, item.label, audio)} />
              <span className="font-mono">{audio.name}</span>
              <span className="text-muted-foreground font-mono tabular-nums">
                {formatTimeHuman(audio.seconds)}
              </span>
              {audio.sharedWith.map((shared) => (
                <span key={shared.href} className="text-muted-foreground">
                  {shared.role === "before"
                    ? t("detail.sharedBefore", { label: shared.label })
                    : t("detail.sharedAfter", { label: shared.label })}
                </span>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function MatchCard({
  label,
  ebook,
  transcript,
}: {
  label: React.ReactNode
  ebook: MatchContext
  transcript?: { before: string; after: string } | undefined
}) {
  const transcriptText =
    `${transcript?.before ?? ""} ${transcript?.after ?? ""}`.trim()
  const { ebookNodes, otherNodes } = highlightOverlap(
    ebook.matchedSentence,
    transcriptText,
  )

  const tNouns = useTranslation("Common.Nouns")
  return (
    <div className="bg-card overflow-hidden border">
      <div className="text-muted-foreground bg-muted/40 flex items-center gap-1.5 border-b px-3 py-2 text-[10px] font-medium tracking-wider uppercase">
        {label}
      </div>
      <div className="px-3 py-2.5">
        <span className="text-muted-foreground flex items-center gap-1 text-[9px] font-medium tracking-wider uppercase">
          <icon.Book className="size-3" /> {tNouns("ebook", { count: 1 })}
        </span>
        <p className="mt-1 text-sm leading-relaxed">
          {ebook.prevSentence && (
            <span className="text-muted-foreground/60">
              {ebook.prevSentence}{" "}
            </span>
          )}
          {ebookNodes}
          {ebook.nextSentence && (
            <span className="text-muted-foreground/60">
              {" "}
              {ebook.nextSentence}
            </span>
          )}
        </p>
      </div>
      {transcript && (
        <div className="border-t border-dashed px-3 py-2.5">
          <span className="text-muted-foreground flex items-center gap-1 text-[9px] font-medium tracking-wider uppercase">
            <icon.Headphones className="size-3" />{" "}
            {tNouns("transcript", { count: 1 })}
          </span>
          <p className="text-muted-foreground mt-1 font-mono text-[11px] leading-relaxed">
            {otherNodes}
          </p>
        </div>
      )}
    </div>
  )
}

function normToken(token: string): string {
  return token.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")
}

function longestCommonRun(
  a: string[],
  b: string[],
): { aStart: number; bStart: number; len: number } {
  const na = a.map(normToken)
  const nb = b.map(normToken)
  let best = { aStart: 0, bStart: 0, len: 0 }
  let prevRow = new Array<number>(nb.length + 1).fill(0)
  for (let i = 1; i <= na.length; i++) {
    const curRow = new Array<number>(nb.length + 1).fill(0)
    for (let j = 1; j <= nb.length; j++) {
      if (na[i - 1] && na[i - 1] === nb[j - 1]) {
        const run = (prevRow[j - 1] ?? 0) + 1
        curRow[j] = run
        if (run > best.len)
          best = { aStart: i - run, bStart: j - run, len: run }
      }
    }
    prevRow = curRow
  }
  return best
}

const HL =
  "box-decoration-clone bg-highlight-bg/70 px-0.5 border-b border-highlight text-foreground dark:bg-highlight/25"

function highlightOverlap(
  ebookText: string,
  transcriptText: string,
): { ebookNodes: React.ReactNode; otherNodes: React.ReactNode } {
  const a = ebookText.match(/\S+/g) ?? []
  const b = transcriptText.match(/\S+/g) ?? []
  const run = longestCommonRun(a, b)

  if (run.len < 2) {
    return { ebookNodes: ebookText, otherNodes: transcriptText }
  }

  const wrap = (
    tokens: string[],
    start: number,
    len: number,
    key: string,
  ): React.ReactNode => {
    const before = tokens.slice(0, start).join(" ")
    const hit = tokens.slice(start, start + len).join(" ")
    const after = tokens.slice(start + len).join(" ")
    return (
      <Fragment key={key}>
        {before && <span>{before} </span>}
        <mark className={HL}>{hit}</mark>
        {after && <span> {after}</span>}
      </Fragment>
    )
  }

  return {
    ebookNodes: wrap(a, run.aStart, run.len, "e"),
    otherNodes: wrap(b, run.bStart, run.len, "t"),
  }
}
