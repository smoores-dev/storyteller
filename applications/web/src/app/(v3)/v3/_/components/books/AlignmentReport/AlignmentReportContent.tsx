"use client"

import {
  type ColumnDef,
  type ExpandedState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { Fragment, useMemo, useState } from "react"

import { Button } from "@v3/_/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@v3/_/components/ui/dropdown-menu"
import { ScrollArea } from "@v3/_/components/ui/scroll-area"
import { Switch } from "@v3/_/components/ui/switch"
import { V3Link } from "@v3/_/components/v3-link"
import { cn } from "@v3/_/lib/utils"

import type {
  BookAlignmentReportView,
  FlagTone,
  ReportChapterRow,
} from "@/alignmentReportView"
import { Badge } from "@/app/(v3)/v3/_/components/ui/badge"
import { useTranslation } from "@/app/(v3)/v3/_/hooks/use-translation"
import {
  useFormatDate,
  useFormatRelativeTime,
} from "@/app/(v3)/v3/_/lib/formatters"
import { formatTimeHuman } from "@/components/reader/preferenceItems/formatTime"
import {
  type AlignmentChapterOverride,
  type AlignmentOverrides,
} from "@/database/alignmentReports"
import * as icon from "@/icons"
import {
  useGetBookAlignmentReportQuery,
  useUpdateBookAlignmentOverridesMutation,
} from "@/store/api"
import type { UUID } from "@/uuid"

function overridesFromView(view: BookAlignmentReportView): AlignmentOverrides {
  const chapters: Record<string, AlignmentChapterOverride> = {}
  for (const ch of view.chapters) {
    if (ch.markedOk) chapters[ch.href] = { markedOk: true }
    else if (ch.excludedFromScore)
      chapters[ch.href] = { excludeFromScore: true }
  }
  const unalignedChapters: Record<string, { intended?: boolean }> = {}
  for (const uc of view.unalignedChapters) {
    if (uc.intended) unalignedChapters[uc.href] = { intended: true }
  }
  const audioFiles: Record<string, { excluded?: boolean }> = {}
  for (const uaf of view.unalignedAudioFiles) {
    if (uaf.excluded) audioFiles[uaf.filepath] = { excluded: true }
  }
  return { chapters, unalignedChapters, audioFiles }
}

function useOverrideEditor(view: BookAlignmentReportView) {
  const [update] = useUpdateBookAlignmentOverridesMutation()
  return useMemo(() => {
    const apply = (next: AlignmentOverrides) => {
      void update({ uuid: view.bookUuid, overrides: next })
    }
    return {
      setChapter(href: string, patch: AlignmentChapterOverride | null) {
        const base = overridesFromView(view)
        let chapters = { ...(base.chapters ?? {}) }
        if (patch) {
          chapters[href] = patch
        } else {
          const { [href]: _, ...extracted } = chapters
          chapters = extracted
        }
        apply({ ...base, chapters })
      },
      toggleIntended(href: string) {
        const base = overridesFromView(view)
        let unaligned = { ...(base.unalignedChapters ?? {}) }
        if (unaligned[href]?.intended) {
          const { [href]: _, ...extracted } = unaligned
          unaligned = extracted
        } else {
          unaligned[href] = { intended: true }
        }
        apply({ ...base, unalignedChapters: unaligned })
      },
      toggleAudioExcluded(filepath: string) {
        const base = overridesFromView(view)
        let audio = { ...(base.audioFiles ?? {}) }
        if (audio[filepath]?.excluded) {
          const { [filepath]: _, ...extracted } = audio
          audio = extracted
        } else {
          audio[filepath] = { excluded: true }
        }
        apply({ ...base, audioFiles: audio })
      },
    }
  }, [view, update])
}

type OverrideEditor = ReturnType<typeof useOverrideEditor>

const TONE_BADGE: Record<FlagTone, string> = {
  poor: "bg-poor-bg text-poor dark:bg-poor-950/40 dark:text-poor-300",
  moderate:
    "bg-moderate-bg text-moderate dark:bg-moderate-950/40 dark:text-moderate-300",
  info: "bg-highlight-bg text-highlight dark:bg-highlight-950/40 dark:text-highlight-300",
  good: "bg-good-bg text-good dark:bg-good-950/40 dark:text-good-300",
}

function FlagBadge({
  tone = "info",
  className,
  children,
}: {
  tone?: FlagTone
  className?: string
  children: React.ReactNode
}) {
  return <Badge className={cn(TONE_BADGE[tone], className)}>{children}</Badge>
}

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
    <div className="flex h-full flex-col">
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
                aria-label="Back"
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
              aria-label="Close"
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
    </div>
  )
}

function ReportBody({ view }: { view: BookAlignmentReportView }) {
  const editor = useOverrideEditor(view)
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-7 p-4">
        <Masthead view={view} />
        <ChapterTable chapters={view.chapters} editor={editor} />
        <UnalignedChapters view={view} editor={editor} />
        <UnalignedAudio view={view} editor={editor} />
      </div>
    </ScrollArea>
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
    <header className={cn("relative px-4 py-3")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              aria-label="Back to details"
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
                {view.bookTitle ?? "Untitled"}
              </h1>
            )}
          </div>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label="Close"
            onClick={onClose}
          >
            <icon.Close className="size-4" />
          </Button>
        )}

        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <V3Link
            href={`/books/${view.bookUuid}/alignment`}
            className="hover:text-primary inline-flex items-center gap-1 hover:underline"
          >
            <icon.ExternalLink className="size-3.5" /> {t("openFullPage")}
          </V3Link>
          {!embedded && (
            <V3Link
              href={`/books/${view.bookUuid}`}
              className="hover:text-primary inline-flex items-center gap-1 hover:underline"
            >
              <icon.Book className="size-3.5" /> Book
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

function gradeTone(grade: string): GradeTone {
  if (grade.startsWith("A")) return "positive"
  if (grade.startsWith("B")) return "good"
  if (grade === "C") return "moderate"
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

function verdictFor(
  view: BookAlignmentReportView,
  t: ReturnType<typeof useTranslation<"AlignmentReport">>,
): {
  lead: string
  em: string
  body: string
} {
  const { summary } = view
  const g = summary.grade
  const lead =
    g === "A+" || g === "A"
      ? t("heading.excellentAlignment")
      : g === "A-"
        ? t("heading.strongAlignment")
        : g.startsWith("B")
          ? t("heading.goodAlignment")
          : g === "C"
            ? t("heading.roughAlignment")
            : g === "D"
              ? t("heading.patchyAlignment")
              : t("heading.alignmentFailed")
  const em =
    g === "A+"
      ? t("heading.nearlyEverySentenceMatched")
      : g === "A"
        ? t("heading.almostEverythingLinedUp")
        : g === "A-"
          ? t("heading.withOnlyAFewGaps")
          : g.startsWith("B")
            ? t("heading.withAFewRoughPatches")
            : g === "C"
              ? t("heading.noticeableGapsRemain")
              : g === "D"
                ? t("heading.largeStretchesDrifted")
                : t("heading.muchOfTheBookDidNotMatch")

  const parts: string[] = []
  parts.push(
    summary.score != null
      ? t("heading.partAlignedScore", {
          score: String(summary.score),
          chapters: String(summary.chapters),
        })
      : t("heading.partNotAlignedScore", {
          chapters: String(summary.chapters),
        }),
  )
  parts.push(
    summary.unalignedAudio === 0
      ? t("heading.partAllAudioPlaced")
      : t("heading.partSomeAudioNotPlaced", {
          count: summary.unalignedAudio,
        }),
  )
  if (summary.missingSentences > 0) {
    parts.push(
      summary.missingSentences <= 12
        ? t("heading.partFewGaps")
        : t("heading.partManyGaps", {
            count: summary.missingSentences,
          }),
    )
  }
  return { lead, em, body: parts.join(" ") }
}

function Masthead({ view }: { view: BookAlignmentReportView }) {
  const { summary } = view
  const tone = gradeTone(summary.grade)
  const t = useTranslation("AlignmentReport")
  const tNouns = useTranslation("Common.Nouns")
  const verdict = verdictFor(view, t)
  const audioPct =
    view.totalAudioDuration > 0
      ? Math.round((view.alignedAudioDuration / view.totalAudioDuration) * 100)
      : null

  const boxes: {
    key: string
    label: string
    value: string
    sub?: string
    extra?: string | null
    tone: MarkTone
  }[] = [
    {
      key: "audio",
      label: t("marks.audioIncluded"),
      value: audioPct != null ? `${audioPct}%` : "—",
      sub: `${formatTimeHuman(view.alignedAudioDuration)} / ${formatTimeHuman(view.totalAudioDuration)}`,
      extra:
        summary.unalignedAudio > 0
          ? t("marks.excludedClips", {
              count: summary.unalignedAudio,
            })
          : null,
      tone:
        audioPct == null
          ? "muted"
          : audioPct >= 99
            ? "good"
            : audioPct >= 95
              ? "moderate"
              : "poor",
    },
    {
      key: "chapters",
      label: tNouns("chapter", { count: summary.chapters }),
      value: `${summary.chapters}`,
      sub: t("marks.mutedChapters", {
        count: summary.mutedChapters,
      }),
      tone: "muted",
    },
    {
      key: "sentences",
      label: t("marks.sentencesAligned"),
      value: summary.score != null ? `${summary.score}%` : "—",
      sub:
        view.totalSentences > 0
          ? `${view.alignedSentences.toLocaleString()} / ${view.totalSentences.toLocaleString()}`
          : "—",
      extra:
        view.significantChapters > 0
          ? t("marks.significantMisalignment", {
              count: view.significantChapters,
            })
          : null,
      tone:
        summary.score == null
          ? "muted"
          : summary.score >= 97
            ? "good"
            : summary.score >= 90
              ? "moderate"
              : "poor",
    },
  ]

  const formatDate = useFormatDate()

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
          <h2 className="text-2xl leading-tight font-normal">
            {verdict.lead}
            {/* <em className="text-primary italic">{verdict.em}</em>. */}
          </h2>
          <p className="text-muted-foreground dark:text-foreground mt-1.5 max-w-prose text-sm leading-relaxed">
            {verdict.body}
          </p>
          <p className="text-muted-foreground dark:text-foreground/80 mt-2.5 font-mono text-[11px]">
            {t("lastGraded", { date: formatDate(view.createdAt) })}
          </p>
        </div>
      </div>

      <div className="bg-border grid grid-cols-1 gap-px border-t @sm/book:grid-cols-3">
        {boxes.map((m) => (
          <div key={m.key} className="bg-card p-3.5">
            <div
              className={cn(
                "text-xl leading-none font-medium tabular-nums",
                MARK_TONE[m.tone],
              )}
            >
              {m.value}
            </div>
            <div className="text-muted-foreground mt-1.5 text-[10px] tracking-wide uppercase">
              {m.label}
            </div>
            {m.sub && (
              <div className="text-muted-foreground/80 mt-0.5 font-mono text-[10px] tabular-nums">
                {m.sub}
              </div>
            )}
            {m.extra && (
              <div className="text-muted-foreground/70 mt-0.5 text-[10px]">
                {m.extra}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function shortHref(href: string): string {
  return (href.split("/").pop() ?? href).replace(/\.[^.]+$/, "")
}

const getColumns = (
  t: ReturnType<typeof useTranslation<"AlignmentReport">>,
  editor: OverrideEditor,
) =>
  [
    {
      id: "expander",
      enableSorting: false,
      header: () => null,
      cell: ({ row }) => (
        <icon.ChevronRight
          className={cn(
            "text-muted-foreground size-4 transition-transform",
            row.getIsExpanded() && "rotate-90",
          )}
        />
      ),
    },
    {
      id: "chapter",
      header: t("table.columns.chapter"),
      accessorFn: (r) => r.label,
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-heading font-medium">{row.original.label}</span>
          {row.original.title && (
            <span className="text-muted-foreground truncate font-mono text-[10px]">
              {shortHref(row.original.href)}
            </span>
          )}
        </div>
      ),
    },
    {
      id: "audio",
      enableSorting: false,
      header: t("table.columns.audio"),
      cell: ({ row }) => {
        const files = row.original.audioFiles
        if (files.length === 0)
          return <FlagBadge tone="poor">no audio</FlagBadge>
        return (
          <span className="text-muted-foreground truncate text-xs">
            {files.map((f) => f.title ?? shortHref(f.filepath)).join(", ")}
          </span>
        )
      },
    },
    {
      id: "duration",
      header: t("table.columns.duration"),
      accessorFn: (r) =>
        r.audioFiles.reduce((s, f) => s + (f.duration ?? 0), 0),
      cell: ({ getValue }) => {
        const total = getValue<number>()
        return (
          <span className="text-muted-foreground tabular-nums">
            {total > 0 ? formatTimeHuman(total) : "—"}
          </span>
        )
      },
    },
    {
      id: "sentences",
      header: t("table.columns.sentences"),
      accessorFn: (r) => r.deltaPct,
      cell: ({ row }) => <SentenceCell row={row.original} />,
    },
    {
      id: "notes",
      enableSorting: false,
      header: t("table.columns.notes"),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.markedOk && (
            <FlagBadge tone="good">{t("overrides.ok")}</FlagBadge>
          )}
          {row.original.excludedFromScore && (
            <FlagBadge tone="info">{t("overrides.excluded")}</FlagBadge>
          )}
          {row.original.flags.map((f) => (
            <FlagBadge key={f.label} tone={f.tone}>
              {f.label}
            </FlagBadge>
          ))}
        </div>
      ),
    },
    {
      id: "actions",
      enableSorting: false,
      header: () => null,
      cell: ({ row }) => <ChapterActions row={row.original} editor={editor} />,
    },
  ] satisfies ColumnDef<ReportChapterRow>[]

function ChapterActions({
  row,
  editor,
}: {
  row: ReportChapterRow
  editor: OverrideEditor
}) {
  const t = useTranslation("AlignmentReport")
  return (
    <div
      onClick={(e) => {
        e.stopPropagation()
      }}
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={t("overrides.menu")}
            >
              <icon.Dots className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuCheckboxItem
            checked={row.markedOk}
            onClick={() => {
              editor.setChapter(
                row.href,
                row.markedOk ? null : { markedOk: true },
              )
            }}
          >
            {t("overrides.markOk")}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={row.excludedFromScore}
            onClick={() => {
              editor.setChapter(
                row.href,
                row.excludedFromScore ? null : { excludeFromScore: true },
              )
            }}
          >
            {t("overrides.excludeFromScore")}
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function SentenceCell({ row }: { row: ReportChapterRow }) {
  const { alignedSentenceCount: al, chapterSentenceCount: total, delta } = row
  const pct = row.coverage != null ? Math.round(row.coverage * 100) : null
  const barTone =
    pct == null
      ? "bg-muted-foreground/40"
      : pct >= 97
        ? "bg-positive/80"
        : pct >= 90
          ? "bg-good/80"
          : "bg-poor/80"
  return (
    <div className="flex min-w-[7rem] flex-col gap-1">
      <div className="flex items-baseline gap-1.5">
        <span className="tabular-nums">
          {al}/{total}
        </span>
        {delta > 0 && (
          <span
            className={cn(
              "text-[10px] tabular-nums",
              row.deltaPct > 0.05 ? "text-poor" : "text-moderate",
            )}
          >
            −{delta}
          </span>
        )}
      </div>
      <div className="bg-muted h-1 w-full overflow-hidden rounded-full">
        <div
          className={cn("h-full rounded-full", barTone)}
          style={{ width: `${pct ?? 0}%` }}
        />
      </div>
    </div>
  )
}

function ChapterTable({
  chapters,
  editor,
}: {
  chapters: ReportChapterRow[]
  editor: OverrideEditor
}) {
  const [expanded, setExpanded] = useState<ExpandedState>({})
  const [sorting, setSorting] = useState<SortingState>([])
  const [flaggedOnly, setFlaggedOnly] = useState(
    () => chapters.some((c) => c.flagged), // default to flagged when any exist
  )

  const flaggedCount = chapters.filter((c) => c.flagged).length
  const data = useMemo(
    () => (flaggedOnly ? chapters.filter((c) => c.flagged) : chapters),
    [chapters, flaggedOnly],
  )

  const t = useTranslation("AlignmentReport")
  const tCommon = useTranslation("Common")

  const columns = useMemo(() => getColumns(t, editor), [t, editor])

  const table = useReactTable({
    data,
    columns,
    state: { expanded, sorting },
    onExpandedChange: setExpanded,
    onSortingChange: setSorting,
    getRowCanExpand: () => true,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-normal">
          {tCommon("Nouns.chapter", { count: data.length })}{" "}
          <span className="text-muted-foreground font-mono text-xs">
            ({tCommon("outOf", { count: data.length, total: chapters.length })})
          </span>
        </h2>
        {flaggedCount > 0 && (
          <label
            htmlFor="flagged-only"
            className="text-muted-foreground flex cursor-pointer items-center gap-2 text-xs"
          >
            {t("table.flaggedOnly")}
            <Switch
              id="flagged-only"
              checked={flaggedOnly}
              onCheckedChange={setFlaggedOnly}
            />
          </label>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sortable = h.column.getCanSort()
                  const sorted = sorting.find((s) => s.id === h.id)
                  const sortingHandler = sortable
                    ? h.column.getToggleSortingHandler()
                    : undefined

                  return (
                    <th
                      key={h.id}
                      className={cn(
                        "px-2 py-1.5 text-left text-xs font-medium",
                        sortable && "hover:text-foreground cursor-pointer",
                      )}
                      onClick={sortingHandler}
                    >
                      <span className="inline-flex items-center gap-1">
                        {h.isPlaceholder
                          ? null
                          : flexRender(
                              h.column.columnDef.header,
                              h.getContext(),
                            )}
                        {sortable &&
                          (sorted?.desc ? (
                            <icon.SortDescending className="size-3" />
                          ) : sorted?.desc === false ? (
                            <icon.SortAscending className="size-3" />
                          ) : (
                            <icon.ArrowsSort className="size-3 opacity-40" />
                          ))}
                      </span>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              const isExpanded =
                typeof expanded === "boolean" || expanded[row.id]
              const _isSorted = sorting.find((s) => s.id === row.id)
              return (
                <Fragment key={row.id}>
                  <tr
                    className={cn(
                      "hover:bg-muted/40 cursor-pointer border-t",
                      row.original.flagged &&
                        "border-l-moderate-border/80 border-l-2",
                      (row.original.markedOk ||
                        row.original.excludedFromScore) &&
                        "opacity-50",
                    )}
                    onClick={row.getToggleExpandedHandler()}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="max-w-[16rem] truncate px-2 py-1.5 align-top"
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                  {isExpanded && (
                    <tr className="bg-muted/20 border-t">
                      <td colSpan={columns.length} className="py-2">
                        <ChapterDetail row={row.original} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ChapterDetail({ row }: { row: ReportChapterRow }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <MatchCard
        label="First match"
        ebook={row.firstMatchedSentenceContext}
        transcript={row.transcriptionContext}
      />
      <MatchCard
        label="Last match"
        ebook={row.lastMatchedSentenceContext}
        transcript={row.endTranscriptionContext}
      />
    </div>
  )
}

function MatchCard({
  label,
  ebook,
  transcript,
}: {
  label: string
  ebook: {
    prevSentence: string | null
    matchedSentence: string
    nextSentence: string | null
  }
  transcript: { before: string; after: string }
}) {
  const transcriptText = `${transcript.before} ${transcript.after}`.trim()
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
      <div className="border-t border-dashed px-3 py-2.5">
        <span className="text-muted-foreground flex items-center gap-1 text-[9px] font-medium tracking-wider uppercase">
          <icon.Headphones className="size-3" />{" "}
          {tNouns("transcript", { count: 1 })}
        </span>
        <p className="text-muted-foreground mt-1 font-mono text-[11px] leading-relaxed">
          {otherNodes}
        </p>
      </div>
    </div>
  )
}

function normToken(t: string): string {
  return t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")
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

const REASON_TONE: Record<string, FlagTone> = {
  "not-found": "poor",
  "too-short": "moderate",
  "is-nav": "info",
  "no-text": "info",
}

function UnalignedChapters({
  view,
  editor,
}: {
  view: BookAlignmentReportView
  editor: OverrideEditor
}) {
  const t = useTranslation("AlignmentReport")
  if (view.unalignedChapters.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-normal">
        {t("unalignedChapters")}{" "}
        <span className="text-muted-foreground font-mono text-xs">
          ({view.unalignedChapters.length})
        </span>
      </h2>
      <div className="overflow-hidden border">
        <table className="w-full text-sm">
          <tbody>
            {view.unalignedChapters.map((uc) => (
              <tr
                key={uc.href}
                className={cn(
                  "border-t first:border-t-0",
                  uc.intended && "opacity-50",
                )}
              >
                <td className="px-2.5 py-1.5 text-xs">{uc.label}</td>
                <td className="w-0 px-2.5 py-1.5">
                  <FlagBadge tone={REASON_TONE[uc.reason] ?? "info"}>
                    {uc.reason}
                  </FlagBadge>
                </td>
                <td className="text-muted-foreground truncate px-2.5 py-1.5 text-xs italic">
                  {uc.preview ?? "—"}
                </td>
                <td className="w-0 px-2.5 py-1.5">
                  <Button
                    variant={uc.intended ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      editor.toggleIntended(uc.href)
                    }}
                  >
                    {uc.intended
                      ? t("overrides.intended")
                      : t("overrides.markIntended")}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function UnalignedAudio({
  view,
  editor,
}: {
  view: BookAlignmentReportView
  editor: OverrideEditor
}) {
  const t = useTranslation("AlignmentReport")
  if (view.unalignedAudioFiles.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-poor dark:text-poor flex items-center gap-1.5 text-lg font-normal">
        <icon.Headphones className="size-4" />
        {t("unalignedAudio.title")}{" "}
        <span className="text-muted-foreground font-mono text-xs">
          ({view.unalignedAudioFiles.length})
        </span>
      </h2>
      <div className="border-poor-border bg-poor-bg/40 dark:divide-poor-900/40 dark:border-poor-900/50 dark:bg-poor-950/20 divide-y divide-amber-200/70 overflow-hidden border">
        {view.unalignedAudioFiles.map((uaf) => (
          <div
            key={uaf.filepath}
            className={cn(
              "flex flex-col gap-1 px-3 py-2.5",
              uaf.excluded && "opacity-50",
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-xs font-medium">
                {uaf.title ?? shortHref(uaf.filepath)}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-[11px] text-amber-700 tabular-nums dark:text-amber-400">
                  {uaf.duration ? formatTimeHuman(uaf.duration) : "—"}
                </span>
                <Button
                  variant={uaf.excluded ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    editor.toggleAudioExcluded(uaf.filepath)
                  }}
                >
                  {uaf.excluded
                    ? t("overrides.clipExcluded")
                    : t("overrides.excludeClip")}
                </Button>
              </div>
            </div>
            {uaf.transcription ? (
              <p className="text-muted-foreground text-xs leading-relaxed">
                <span className="font-medium text-amber-700 dark:text-amber-400">
                  {t("unalignedAudio.heard")}:
                </span>{" "}
                {uaf.transcription}
              </p>
            ) : (
              <p className="text-muted-foreground/60 text-xs italic">
                {t("unalignedAudio.noTranscription")}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
