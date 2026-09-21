import { useFormatter } from "next-intl"

import { GradePill } from "@/app/(v3)/v3/_/components/books/grade-pill"
import {
  DEFAULT_DATE_OPTIONS,
  useFormatDuration,
  useFormatList,
  useFormatRelativeTime,
} from "@/app/(v3)/v3/_/lib/formatters"
import { type BookWithRelations } from "@/database/books"
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
    case "alignmentConfidence":
      return book.alignmentSummary?.confidence != null
        ? `${Math.round(book.alignmentSummary.confidence)}%`
        : "\u2014"
    case "alignmentGrade":
      return book.alignmentSummary?.grade ? (
        <GradePill grade={book.alignmentSummary.grade} />
      ) : (
        "\u2014"
      )
    case "alignmentPreviousGrade":
      return book.alignmentSummary?.previousGrade ? (
        <GradePill
          grade={book.alignmentSummary.previousGrade}
          className="opacity-60"
        />
      ) : (
        "\u2014"
      )
    case "alignmentSentenceCoverage":
      return book.alignmentSummary?.sentenceCoverage != null
        ? `${Math.round(book.alignmentSummary.sentenceCoverage)}%`
        : "\u2014"
    case "alignmentAudioCoverage":
      return book.alignmentSummary?.audioCoverage != null
        ? `${Math.round(book.alignmentSummary.audioCoverage)}%`
        : "\u2014"
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

export const columnWidths: Record<DisplayField, number> = {
  authors: 80,
  narrators: 80,
  translators: 80,
  creators: 80,
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
  alignmentConfidence: 60,
  alignmentGrade: 60,
  alignmentPreviousGrade: 60,
  alignmentSentenceCoverage: 60,
  alignmentAudioCoverage: 60,
}

export function getColumnWidth(field: DisplayField, label: string) {
  return `max(${columnWidths[field]}px, ${label.length + 2}ch)`
}
