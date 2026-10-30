import { type ShelfFilterOperator } from "@/shelves"

export type FieldGroupKey =
  | "text"
  | "dates"
  | "review"
  | "relations"
  | "media"
  | "alignment"
  | "creators"

export type FacetSource =
  | "tags"
  | "collections"
  | "series"
  | "statuses"
  | "authors"
  | "narrators"
  | "translators"
  | "creators"
  | "identifiers"
  | "distinct"

export type FieldScale = {
  min?: number
  max?: number
  step?: number
  unit?: "bytes" | "seconds" | "count" | "ratio" | "year" | "percent"
}

export type FieldType = "string" | "number" | "date" | "uuid" | "array" | "enum"

export type QualifierKind =
  | "role"
  | "ratingAxis"
  | "identifierScheme"
  | "datePart"
  | "series"

export type FilterEntityType =
  | "tag"
  | "collection"
  | "series"
  | "status"
  | "creator"
  | "identifierType"

export type ImportMode = "whole" | "each"

export const ASSET_FORMATS = ["ebook", "audiobook", "readaloud"] as const
export type AssetFormat = (typeof ASSET_FORMATS)[number]

export type DatePreset = { label: string; days: number }

export type FieldDefBase = {
  sortable: boolean
  displayOnly?: true
  defaultSort?: "asc" | "desc"
  quick: boolean
  token: string
  labelKey: string
  group: FieldGroupKey
  type: FieldType
  qualifier?: { kind: QualifierKind }
  formats?: readonly AssetFormat[]
  countable?: true
  compact?: true
  importable?: ImportMode
  entity?: FilterEntityType
  qualifierEntity?: FilterEntityType
  alias?: { of: string; qualifier: string }
  filterUnder?: string
  extraOperators?: ShelfFilterOperator[]
  defaultOperator?: ShelfFilterOperator
}

export type FieldDefText = FieldDefBase & {
  control: "text"
}

export type FieldDefFacet = FieldDefBase & {
  control: "facet"
  source: FacetSource
}

export type FieldDefEnum = FieldDefBase & {
  control: "enum"
  options: string[]
}

export type FieldDefNumeric = FieldDefBase & {
  control: "number-range"
  scale?: FieldScale
  options?: { min: number; max: number; label: string }[]
}

export type FieldDefDate = FieldDefBase & {
  control: "date-range"
  qualifier: { kind: "datePart" }
  scale?: FieldScale
  presets?: DatePreset[]
}

export type FieldDefDuration = FieldDefBase & {
  control: "duration-range"
  scale: FieldScale
  options?: { min: number; max: number; label: string }[]
}

export type RetiredFieldDef = {
  labelKey: string
  replacedBy: string | null
}

export type FieldDef =
  | FieldDefFacet
  | FieldDefEnum
  | FieldDefNumeric
  | FieldDefDate
  | FieldDefDuration
  | FieldDefText
