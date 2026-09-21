import { type AcceptedKeys } from "@/app/(v3)/v3/_/lib/mapping"

import {
  type DatePreset,
  type FieldDef,
  type FieldType,
  type RetiredFieldDef,
} from "./types"

export const ALIGNMENT_GRADES = ["S", "A", "B", "C", "D", "F"] as const

export const RECENCY_DATE_PRESETS: DatePreset[] = [
  { label: "Last 24 hours", days: 1 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 6 months", days: 182 },
  { label: "Last year", days: 365 },
]

export const FORMAT_VALUES = [
  "ebook",
  "audiobook",
  "readaloud",
  "ebook-only",
  "audiobook-only",
  "readaloud-only",
  "missing-readaloud",
  "missing-files",
  "no-media",
] as const

export type FormatValue = (typeof FORMAT_VALUES)[number]

export const FIELD_REGISTRY = {
  title: {
    control: "text",
    sortable: true,
    defaultSort: "asc",
    quick: false,
    token: "title",
    labelKey: "title",
    group: "text",
    type: "string",
  },
  subtitle: {
    control: "text",
    sortable: false,
    quick: false,
    token: "subtitle",
    labelKey: "subtitle",
    group: "text",
    type: "string",
  },
  description: {
    control: "text",
    sortable: false,
    quick: false,
    token: "description",
    labelKey: "description",
    group: "text",
    type: "string",
  },
  language: {
    control: "facet",
    source: "distinct",
    sortable: true,
    defaultSort: "asc",
    quick: true,
    token: "language",
    labelKey: "language",
    group: "text",
    type: "string",
    defaultOperator: "isAnyOf",
  },
  review: {
    control: "text",
    sortable: false,
    quick: false,
    token: "review",
    labelKey: "review",
    group: "text",
    type: "string",
  },
  search: {
    control: "text",
    sortable: false,
    quick: false,
    token: "text",
    labelKey: "search",
    group: "text",
    type: "string",
  },

  pageCount: {
    control: "number-range",
    sortable: true,
    defaultSort: "desc",
    quick: true,
    formats: ["ebook", "readaloud"],
    scale: { min: 0, step: 1, unit: "count" },
    token: "pages",
    labelKey: "pageCount",
    options: [
      { min: 0, max: 150, label: "< 150" },
      { min: 150, max: 400, label: "150-400" },
      { min: 400, max: 800, label: "400-800" },
      { min: 800, max: Number.MAX_SAFE_INTEGER, label: "> 800" },
    ],
    group: "media",
    type: "number",
  },
  duration: {
    control: "duration-range",
    sortable: true,
    defaultSort: "desc",
    quick: true,
    formats: ["audiobook", "readaloud"],
    scale: { min: 0, unit: "seconds" },
    token: "duration",
    labelKey: "duration",
    options: [
      { min: 0, max: 3 * 3600, label: "< 3h" },
      { min: 3 * 3600, max: 10 * 3600, label: "3-10h" },
      { min: 10 * 3600, max: 20 * 3600, label: "10-20h" },
      { min: 20 * 3600, max: Number.MAX_SAFE_INTEGER, label: "> 20h" },
    ],
    group: "media",
    type: "number",
  },

  publicationDate: {
    control: "date-range",
    sortable: true,
    quick: true,
    defaultSort: "desc",
    qualifier: { kind: "datePart" },
    scale: { unit: "year" },
    token: "published",
    labelKey: "publicationDate",
    group: "dates",
    type: "date",
  },
  createdAt: {
    control: "date-range",
    sortable: true,
    quick: true,
    defaultSort: "desc",
    qualifier: { kind: "datePart" },
    token: "added",
    labelKey: "createdAt",
    presets: RECENCY_DATE_PRESETS,
    group: "dates",
    type: "date",
  },
  updatedAt: {
    control: "date-range",
    sortable: true,
    quick: true,
    defaultSort: "desc",
    qualifier: { kind: "datePart" },
    token: "updated",
    labelKey: "updatedAt",
    presets: RECENCY_DATE_PRESETS,
    group: "dates",
    type: "date",
  },
  fileSize: {
    control: "number-range",
    sortable: true,
    quick: true,
    defaultSort: "desc",
    formats: ["ebook", "audiobook", "readaloud"],
    scale: { min: 0, step: 500, unit: "bytes" },
    token: "size",
    labelKey: "fileSize",
    options: [
      { min: 0, max: 5 * 1024 * 1024, label: "< 5 MB" },
      { min: 5 * 1024 * 1024, max: 20 * 1024 * 1024, label: "5-20 MB" },
      { min: 20 * 1024 * 1024, max: 100 * 1024 * 1024, label: "20-100 MB" },
      {
        min: 100 * 1024 * 1024,
        max: Number.MAX_SAFE_INTEGER,
        label: "> 100 MB",
      },
    ],
    group: "media",
    type: "number",
  },

  format: {
    control: "enum",
    sortable: false,
    quick: true,
    options: [...FORMAT_VALUES],
    token: "format",
    labelKey: "format",
    group: "media",
    type: "enum",
  },
  tags: {
    control: "facet",
    sortable: false,
    quick: true,
    source: "tags",
    token: "tag",
    labelKey: "tags",
    group: "relations",
    type: "array",
    entity: "tag",
    countable: true,
  },
  collections: {
    control: "facet",
    sortable: false,
    quick: true,
    source: "collections",
    token: "collection",
    labelKey: "collections",
    group: "relations",
    type: "array",
    entity: "collection",
    countable: true,
  },
  series: {
    control: "facet",
    sortable: false,
    quick: true,
    source: "series",
    token: "series",
    labelKey: "series",
    group: "relations",
    type: "array",
    entity: "series",
    countable: true,
  },
  authors: {
    control: "facet",
    sortable: true,
    defaultSort: "asc",
    quick: true,
    source: "authors",
    token: "author",
    labelKey: "authors",
    group: "creators",
    type: "array",
    entity: "creator",
    countable: true,
    alias: { of: "creators", qualifier: "aut" },
  },
  narrators: {
    control: "facet",
    sortable: false,
    quick: true,
    source: "narrators",
    token: "narrator",
    labelKey: "narrators",
    group: "creators",
    type: "array",
    entity: "creator",
    countable: true,
    alias: { of: "creators", qualifier: "nrt" },
  },
  translators: {
    control: "facet",
    sortable: false,
    quick: true,
    source: "translators",
    token: "translator",
    labelKey: "translators",
    group: "creators",
    type: "array",
    entity: "creator",
    countable: true,
    alias: { of: "creators", qualifier: "trl" },
  },
  creators: {
    control: "facet",
    sortable: false,
    quick: true,
    source: "creators",
    qualifier: { kind: "role" },
    token: "author",
    labelKey: "creators",
    group: "creators",
    type: "array",
    entity: "creator",
    countable: true,
  },
  identifiers: {
    control: "facet",
    sortable: false,
    quick: false,
    source: "identifiers",
    qualifier: { kind: "identifierScheme" },
    formats: ["ebook", "audiobook", "readaloud"],
    token: "identifier",
    labelKey: "identifiers",
    group: "relations",
    type: "string",
    countable: true,
    qualifierEntity: "identifierType",
    defaultOperator: "isNotEmpty",
  },

  status: {
    control: "facet",
    sortable: false,
    quick: true,
    source: "statuses",
    token: "status",
    labelKey: "status",
    group: "relations",
    type: "uuid",
    entity: "status",
  },
  userRating: {
    control: "number-range",
    sortable: true,
    defaultSort: "desc",
    quick: true,
    qualifier: { kind: "ratingAxis" },
    scale: { min: 0, max: 5, step: 0.5, unit: "count" },
    token: "rating",
    labelKey: "userRating",
    options: [
      { min: 0, max: 0.99, label: "☆☆☆☆☆" },
      { min: 1, max: 1.99, label: "★☆☆☆☆" },
      { min: 2, max: 2.99, label: "★★☆☆☆" },
      { min: 3, max: 3.99, label: "★★★☆☆" },
      { min: 4, max: 4.99, label: "★★★★☆" },
      { min: 5, max: 5, label: "★★★★★" },
    ],
    group: "media",
    type: "number",
  },
  readingPosition: {
    control: "number-range",
    sortable: false,
    quick: true,
    scale: { min: 0, max: 1, step: 0.01, unit: "ratio" },
    token: "progress",
    labelKey: "readingPosition",
    options: [
      { min: 0, max: 0.001, label: "Not started" },
      { min: 0.001, max: 0.999, label: "In progress" },
      { min: 0.999, max: 1, label: "Finished" },
    ],
    group: "review",
    type: "number",
  },
  lastRead: {
    control: "date-range",
    sortable: true,
    defaultSort: "desc",
    quick: true,
    qualifier: { kind: "datePart" },
    token: "read",
    labelKey: "lastRead",
    presets: RECENCY_DATE_PRESETS,
    group: "review",
    type: "date",
  },

  alignmentGrade: {
    control: "enum",
    sortable: true,
    quick: true,
    token: "grade",
    options: [...ALIGNMENT_GRADES],
    labelKey: "alignmentGrade",
    group: "alignment",
    type: "enum",
  },
  alignmentPreviousGrade: {
    control: "enum",
    sortable: false,
    displayOnly: true,
    quick: false,
    token: "previousGrade",
    options: [...ALIGNMENT_GRADES],
    labelKey: "alignmentPreviousGrade",
    group: "alignment",
    type: "enum",
  },
  alignmentConfidence: {
    control: "number-range",
    sortable: true,
    quick: true,
    type: "number",
    scale: { min: 0, max: 100, unit: "percent" },
    token: "confidence",
    labelKey: "alignmentConfidence",
    group: "alignment",
    defaultOperator: "greaterOrEqual",
  },
  alignmentSentenceCoverage: {
    control: "number-range",
    sortable: true,
    quick: true,
    type: "number",
    token: "sentences",
    labelKey: "alignmentSentenceCoverage",
    scale: { min: 0, max: 100, unit: "percent" },
    group: "alignment",
    defaultOperator: "greaterOrEqual",
  },
  alignmentAudioCoverage: {
    control: "number-range",
    sortable: true,
    quick: true,
    type: "number",
    token: "audio",
    labelKey: "alignmentAudioCoverage",
    scale: { min: 0, max: 100, unit: "percent" },
    group: "alignment",
    defaultOperator: "greaterOrEqual",
  },
  alignedAt: {
    control: "date-range",
    sortable: true,
    quick: true,
    token: "aligned",
    qualifier: { kind: "datePart" },
    labelKey: "alignedAt",
    presets: RECENCY_DATE_PRESETS,
    group: "alignment",
    type: "date",
  },
  alignedWith: {
    control: "facet",
    source: "distinct",
    sortable: false,
    quick: true,
    token: "engine",
    labelKey: "alignedWith",
    group: "alignment",
    type: "string",
    defaultOperator: "isAnyOf",
  },
  alignedByStorytellerVersion: {
    control: "facet",
    source: "distinct",
    sortable: false,
    quick: true,
    token: "aligner",
    labelKey: "alignedByStorytellerVersion",
    group: "alignment",
    type: "string",
    defaultOperator: "isAnyOf",
  },
} as const satisfies Record<string, FieldDef>

export type Field = keyof typeof FIELD_REGISTRY

export const FIELDS = Object.keys(FIELD_REGISTRY) as Field[]

export function getFieldDef(field: Field): FieldDef {
  return FIELD_REGISTRY[field]
}

export function getFieldType(field: Field): FieldType {
  return FIELD_REGISTRY[field].type
}

export type StringField = AcceptedKeys<
  typeof FIELD_REGISTRY,
  { type: "string" }
>
export const STRING_FIELDS = Object.keys(FIELD_REGISTRY).filter(
  (f) => FIELD_REGISTRY[f as Field].type === "string",
) as StringField[]

export type NumberField = AcceptedKeys<
  typeof FIELD_REGISTRY,
  { type: "number" }
>
export const NUMBER_FIELDS = Object.keys(FIELD_REGISTRY).filter(
  (f) => FIELD_REGISTRY[f as Field].type === "number",
) as NumberField[]

export type DateField = AcceptedKeys<typeof FIELD_REGISTRY, { type: "date" }>
export const DATE_FIELDS = Object.keys(FIELD_REGISTRY).filter(
  (f) => FIELD_REGISTRY[f as Field].type === "date",
) as DateField[]

export type UUIDField = AcceptedKeys<typeof FIELD_REGISTRY, { type: "uuid" }>
export const UUID_FIELDS = Object.keys(FIELD_REGISTRY).filter(
  (f) => FIELD_REGISTRY[f as Field].type === "uuid",
) as UUIDField[]

export type ArrayField = AcceptedKeys<typeof FIELD_REGISTRY, { type: "array" }>
export const ARRAY_FIELDS = Object.keys(FIELD_REGISTRY).filter(
  (f) => FIELD_REGISTRY[f as Field].type === "array",
) as ArrayField[]

export type EnumField = AcceptedKeys<typeof FIELD_REGISTRY, { type: "enum" }>
export const ENUM_FIELDS = Object.keys(FIELD_REGISTRY).filter(
  (f) => FIELD_REGISTRY[f as Field].type === "enum",
) as EnumField[]

export type CanBeEmptyField = Exclude<Field, "search">
export const CAN_BE_EMPTY_FIELDS = FIELDS.filter(
  (f) => f !== "search",
) as CanBeEmptyField[]

export type CountableField = AcceptedKeys<
  typeof FIELD_REGISTRY,
  { countable: true }
>
export const COUNTABLE_FIELDS = FIELDS.filter(
  (f) => "countable" in FIELD_REGISTRY[f] && FIELD_REGISTRY[f].countable,
) as CountableField[]

export type QuickFilterField = AcceptedKeys<
  typeof FIELD_REGISTRY,
  { quick: true }
>
export const QUICK_FILTER_FIELDS = Object.keys(FIELD_REGISTRY).filter((f) => {
  const field = FIELD_REGISTRY[f as Field]
  return field.quick
}) as QuickFilterField[]

export type DistinctFacetField = AcceptedKeys<
  typeof FIELD_REGISTRY,
  { control: "facet"; source: "distinct" }
>
export const DISTINCT_FACET_FIELDS = FIELDS.filter((f) => {
  const def = FIELD_REGISTRY[f]
  return def.control === "facet" && def.source === "distinct"
}) as DistinctFacetField[]

export function isDistinctFacetField(
  value: string,
): value is DistinctFacetField {
  return (DISTINCT_FACET_FIELDS as string[]).includes(value)
}

export const RETIRED_FIELDS = {
  alignmentScore: {
    labelKey: "alignmentScore",
    replacedBy: "alignmentConfidence",
  },
  alignmentMissingSentences: {
    labelKey: "alignmentMissingSentences",
    replacedBy: "alignmentSentenceCoverage",
  },
  alignmentMutedChapters: {
    labelKey: "alignmentMutedChapters",
    replacedBy: "alignmentAudioCoverage",
  },
} as const satisfies Record<
  string,
  RetiredFieldDef & { replacedBy: Field | null }
>

export type RetiredField = keyof typeof RETIRED_FIELDS

export function isField(value: string): value is Field {
  return value in FIELD_REGISTRY
}

export function isRetiredField(value: string): value is RetiredField {
  return value in RETIRED_FIELDS
}
