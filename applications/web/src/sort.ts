import { type BookWithRelations } from "@/database/books"
import { ALIGNMENT_GRADES, COMPACT_FIELDS, FIELD_REGISTRY } from "@/fields"
import { type ShelfFilterNode } from "@/shelves"
import { type UUID } from "@/uuid"

import { type AcceptedKeys } from "./app/(v3)/v3/_/lib/mapping"

export type RegistrySortField = AcceptedKeys<
  typeof FIELD_REGISTRY,
  { sortable: true }
>
export type SortField = RegistrySortField | "seriesPosition"

export const SORTABLE_FIELDS = Object.entries(FIELD_REGISTRY)
  .filter(([_f, p]) => p.sortable)
  .map(([f]) => f) as RegistrySortField[]

export const GRADE_RANK: Record<string, number> = Object.fromEntries(
  ALIGNMENT_GRADES.map((grade, i) => [grade, ALIGNMENT_GRADES.length - i]),
)

export type SortDirection = "asc" | "desc"
export type BookSort = { field: SortField; direction: SortDirection }[]

export const GENERAL_SORT_FIELDS: RegistrySortField[] = SORTABLE_FIELDS

export type SortContext = { seriesUuid?: UUID | null }

export type CreatorDisplayField =
  | "authors"
  | "narrators"
  | "translators"
  | "creators"
export const CREATOR_DISPLAY_FIELDS: readonly CreatorDisplayField[] =
  Object.entries(FIELD_REGISTRY)
    .filter(([, def]) => def.group === "creators" && !def.sortable)
    .map(([field]) => field) as CreatorDisplayField[]

export type DisplayOnlyField = AcceptedKeys<
  typeof FIELD_REGISTRY,
  { displayOnly: true }
>
export const DISPLAY_ONLY_FIELDS: readonly DisplayOnlyField[] = Object.entries(
  FIELD_REGISTRY,
)
  .filter(([, def]) => "displayOnly" in def)
  .map(([field]) => field) as DisplayOnlyField[]

export type DisplayField = SortField | CreatorDisplayField | DisplayOnlyField

export const DISPLAY_FIELDS = [
  ...SORTABLE_FIELDS,
  ...CREATOR_DISPLAY_FIELDS,
  ...DISPLAY_ONLY_FIELDS,
] as const

const NEUTRAL_DISPLAY_FIELDS: readonly SortField[] = [
  "createdAt",
  "updatedAt",
  "title",
  "language",
]

function deriveAutoSecondary(
  sortField: SortField,
  isDefaultSort: boolean,
  filter?: ShelfFilterNode,
  ctx?: SortContext,
): DisplayField {
  if (sortField !== "title") {
    if (!isDefaultSort) return sortField
    if (!NEUTRAL_DISPLAY_FIELDS.includes(sortField)) return sortField
  }
  if (filter?.type === "condition") {
    if ((DISPLAY_FIELDS as readonly string[]).includes(filter.field)) {
      return filter.field as DisplayField
    }
  }

  if (ctx?.seriesUuid) return "seriesPosition"
  return "authors"
}

export function deriveDisplayFields(
  sortField: SortField,
  filter?: ShelfFilterNode,
  ctx?: SortContext,
  overrides?: DisplayField[] | null,
  isDefaultSort = true,
): DisplayField[] {
  if (overrides) return overrides

  const secondary = deriveAutoSecondary(sortField, isDefaultSort, filter, ctx)
  return secondary === "title" ? ["title"] : [secondary, "title"]
}

const COMPACT_DISPLAY_FIELDS: ReadonlySet<DisplayField> = new Set(
  COMPACT_FIELDS,
)

const MAX_COMPACT_PER_ROW = 3

export function groupDisplayRows(fields: DisplayField[]): DisplayField[][] {
  const rows: DisplayField[][] = []
  for (const field of fields) {
    const last = rows[rows.length - 1]
    if (
      last &&
      COMPACT_DISPLAY_FIELDS.has(field) &&
      last.length < MAX_COMPACT_PER_ROW &&
      last.every((f) => COMPACT_DISPLAY_FIELDS.has(f))
    ) {
      last.push(field)
    } else {
      rows.push([field])
    }
  }
  return rows
}

export function insertDisplayField(
  fields: DisplayField[],
  field: DisplayField,
): DisplayField[] {
  const titleIndex = fields.indexOf("title")
  if (titleIndex === -1) return [...fields, field]
  return [...fields.slice(0, titleIndex), field, ...fields.slice(titleIndex)]
}

// If ctx contains a seriesUuid, use that series instead of the featured
// series for displaying data such as series.position.
export function displaySeriesOf(
  book: BookWithRelations,
  ctx: SortContext | undefined,
): BookWithRelations["series"][number] | undefined {
  if (ctx?.seriesUuid) {
    return book.series.find((s) => s.uuid === ctx.seriesUuid)
  }
  return book.series.find((s) => s.featured) ?? book.series[0]
}

function seriesPositionOf(
  book: BookWithRelations,
  ctx: SortContext | undefined,
): number | null {
  return displaySeriesOf(book, ctx)?.position ?? null
}

function sortValue(
  book: BookWithRelations,
  field: SortField,
  ctx: SortContext | undefined,
): string | number | null {
  switch (field) {
    case "title":
      return book.title
    case "language":
      return book.language
    case "createdAt":
      return book.createdAt
    case "updatedAt":
      return book.updatedAt
    case "publicationDate":
      return book.publicationDate
    case "releaseDate":
      return book.releaseDate
    case "userRating":
      return book.userBookRating?.rating ?? null
    case "pageCount":
      return book.ebook?.pageCount ?? book.pageCount
    case "duration":
      return book.audiobook?.duration ?? book.duration
    case "fileSize":
      return book.ebook?.fileSize ?? book.audiobook?.fileSize ?? null
    case "authors":
      return book.authors.map((a) => a.name).join(", ")
    case "alignmentConfidence":
      return book.alignmentSummary?.confidence ?? null
    case "alignmentGrade":
      return book.alignmentSummary?.grade
        ? (GRADE_RANK[book.alignmentSummary.grade] ?? null)
        : null
    case "alignmentSentenceCoverage":
      return book.alignmentSummary?.sentenceCoverage ?? null
    case "alignmentAudioCoverage":
      return book.alignmentSummary?.audioCoverage ?? null
    case "alignedAt":
      return book.alignedAt
    case "lastRead":
      return book.position?.updatedAt ?? null
    case "seriesPosition":
      return seriesPositionOf(book, ctx)
  }
}

export function makeBookComparator(
  field: SortField,
  direction: SortDirection,
  ctx?: SortContext,
): (a: BookWithRelations, b: BookWithRelations) => number {
  const dir = direction === "asc" ? 1 : -1
  return (a, b) => {
    const av = sortValue(a, field, ctx)
    const bv = sortValue(b, field, ctx)

    if (av === null && bv === null) return 0
    if (av === null) return 1
    if (bv === null) return -1

    if (typeof av === "string" && typeof bv === "string") {
      return av.localeCompare(bv) * dir
    }
    return (Number(av) - Number(bv)) * dir
  }
}
