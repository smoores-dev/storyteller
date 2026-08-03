import { useFormatter } from "next-intl"

import {
  type SortDirection,
  type SortField,
} from "@/app/(v3)/v3/_/components/books/BookFilters"
import { GradePill } from "@/app/(v3)/v3/_/components/books/grade-pill"
import { useTranslation } from "@/app/(v3)/v3/_/hooks/use-translation"
import {
  DEFAULT_DATE_OPTIONS,
  useFormatDuration,
  useFormatList,
  useFormatRelativeTime,
} from "@/app/(v3)/v3/_/lib/formatters"
import { cn } from "@/cn"
import { type BookWithRelations } from "@/database/books"
import * as icon from "@/icons"
import { type DisplayField } from "@/sort"
import { formatFileSize } from "@/utils/formatFileSize"

export function ColumnValue({
  book,
  field,
}: {
  book: BookWithRelations
  field: DisplayField
}) {
  const formatRelativeTime = useFormatRelativeTime()
  // const formatDate = useFormatDate()
  const formatList = useFormatList()
  const formatDuration = useFormatDuration()
  const { dateTime } = useFormatter()

  switch (field) {
    case "authors":
      return formatList(book.authors.map((a) => a.name)) || "\u2014"
    case "narrators":
      return formatList(book.narrators.map((n) => n.name)) || "\u2014"
    case "translators":
      return (
        formatList(
          book.creators.filter((c) => c.role === "trl").map((c) => c.name),
        ) || "\u2014"
      )
    case "creators":
      return (
        formatList(
          book.creators
            .filter((c) => c.role !== "trl")
            .map((c) => (c.role ? `${c.name} (${c.role})` : c.name)),
        ) || "\u2014"
      )
    case "userRating":
      return book.userBookRating?.rating != null
        ? `\u2605 ${book.userBookRating.rating.toFixed(1)}`
        : "\u2014"
    case "publicationDate":
      if (!book.publicationDate) return "\u2014"
      return dateTime(new Date(book.publicationDate), {
        year: "numeric",
        timeZone: "UTC",
      })
    case "createdAt":
      return dateTime(new Date(book.createdAt), {
        dateStyle: "medium",
      })
    case "updatedAt":
      return (
        <time
          dateTime={book.updatedAt}
          title={dateTime(new Date(book.updatedAt), DEFAULT_DATE_OPTIONS)}
        >
          {formatRelativeTime(book.updatedAt, {
            now: new Date(),
            style: "narrow",
          })}
        </time>
      )
    case "pageCount": {
      const p = book.ebook?.pageCount ?? book.pageCount
      return p != null ? `${p}` : "\u2014"
    }
    case "duration": {
      const d = book.audiobook?.duration ?? book.duration
      return d != null ? formatDuration(d) : "\u2014"
    }
    case "fileSize": {
      const f = book.ebook?.fileSize ?? book.audiobook?.fileSize ?? null
      return f != null ? formatFileSize(f) : "\u2014"
    }
    case "language":
      return book.language ?? "\u2014"
    case "alignmentScore":
      return book.alignmentSummary?.score != null
        ? `${Math.round(book.alignmentSummary.score)}%`
        : "\u2014"
    case "alignmentGrade":
      return book.alignmentSummary?.grade ? (
        <GradePill grade={book.alignmentSummary.grade} />
      ) : (
        "\u2014"
      )
    case "alignmentMissingSentences":
      return book.alignmentSummary?.missingSentences != null
        ? `${book.alignmentSummary.missingSentences}`
        : "\u2014"
    case "alignmentMutedChapters":
      return book.alignmentSummary?.mutedChapters != null
        ? `${book.alignmentSummary.mutedChapters}`
        : "\u2014"
    // case "alignmentMissingChapters":
    //   return book.alignmentSummary?.unalignedAudio != null
    //     ? `${book.alignmentSummary.unalignedAudio}`
    //     : "\u2014"
    case "title":
      return book.title
    case "alignedAt":
      return book.alignedAt
        ? dateTime(new Date(book.alignedAt), { dateStyle: "medium" })
        : "\u2014"
    case "lastRead":
      return book.position?.updatedAt ? (
        <time
          dateTime={book.position.updatedAt}
          title={dateTime(
            new Date(book.position.updatedAt),
            DEFAULT_DATE_OPTIONS,
          )}
        >
          {formatRelativeTime(book.position.updatedAt, {
            now: new Date(),
            style: "narrow",
          })}
        </time>
      ) : (
        "\u2014"
      )
    case "seriesPosition": {
      const s = book.series[0]
      if (!s || s.position == null) return "\u2014"
      return `#${s.position}`
    }
  }
}

export const DEFAULT_COLUMNS: DisplayField[] = [
  "authors",
  "duration",
  "pageCount",
]

export const ESTIMATED_ROW_HEIGHT = 58

export const columnWidths: Record<DisplayField, number> = {
  authors: 80,
  narrators: 80,
  translators: 80,
  creators: 80,
  // alignmentMissingChapters: 60,
  duration: 40,
  pageCount: 40,
  fileSize: 40,
  language: 50,
  publicationDate: 50,
  createdAt: 80,
  updatedAt: 100,
  alignedAt: 80,
  lastRead: 100,
  seriesPosition: 30,
  title: 100,
  userRating: 50,
  alignmentScore: 50,
  alignmentGrade: 40,
  alignmentMissingSentences: 60,
  alignmentMutedChapters: 60,
}

export function getColumnWidth(field: DisplayField, label: string) {
  // + 2 is for the chevron
  // could also use retext to measure the actual width of the label
  return `max(${columnWidths[field]}px, ${label.length + 2}ch)`
}

export function ColumnHeader({
  field,
  sortField,
  sortDirection,
  onSortChange,
}: {
  field: DisplayField
  sortField?: SortField
  sortDirection?: SortDirection
  onSortChange?: (field: SortField, direction: SortDirection) => void
}) {
  const t = useTranslation("Common.fields")

  if (field === "authors" || field === "title") return null

  const isSortable = !!onSortChange
  const isActive = sortField === field
  const label = t(`short.${field}`)

  const handleClick = () => {
    if (!onSortChange) return

    const sortableField = field as SortField
    if (isActive) {
      onSortChange(sortableField, sortDirection === "asc" ? "desc" : "asc")
    } else {
      onSortChange(sortableField, "desc")
    }
  }

  return (
    <button
      type="button"
      className={cn(
        "text-muted-foreground hidden h-full min-w-fit shrink-0 items-center justify-end gap-0.5 text-right text-[11px] font-medium tracking-wider uppercase sm:flex",
        isSortable && "hover:text-foreground cursor-pointer",
        isActive && "text-foreground",
      )}
      style={{ width: getColumnWidth(field, label) }}
      onClick={isSortable ? handleClick : undefined}
      disabled={!isSortable}
    >
      <span className="truncate">{label}</span>

      {isActive &&
        (sortDirection === "asc" ? (
          <icon.ChevronUp className="size-3 shrink-0" />
        ) : (
          <icon.ChevronDown className="size-3 shrink-0" />
        ))}
    </button>
  )
}
