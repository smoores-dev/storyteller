import { type ComponentType } from "react"

import { isRetiredField } from "@/fields"
import { type ShelfFilterField } from "@/shelves"

import * as icon from "./source"
import { type StyledIconProps } from "./styled"

type FieldIconKey = ShelfFilterField | "authors" | "seriesPosition"

type FieldIconDef = {
  base: ComponentType<StyledIconProps>
  add?: ComponentType<StyledIconProps>
  remove?: ComponentType<StyledIconProps>
  filled?: ComponentType<StyledIconProps>
}

const FIELD_ICONS: Record<FieldIconKey, FieldIconDef> = {
  title: { base: icon.Heading },
  subtitle: { base: icon.TextCaption },
  description: { base: icon.AlignLeft },
  language: { base: icon.Language },
  review: { base: icon.Pencil },
  search: { base: icon.Search },
  alignmentGrade: { base: icon.Certificate },
  alignmentPreviousGrade: { base: icon.History },
  status: { base: icon.Progress },
  tags: {
    base: icon.Tag,
    add: icon.TagAdd,
    remove: icon.TagRemove,
    filled: icon.TagFilled,
  },
  collections: { base: icon.Folders },
  series: { base: icon.Books },
  creators: { base: icon.Users },
  narrators: { base: icon.Microphone },
  translators: { base: icon.Language },
  authors: { base: icon.User },
  format: { base: icon.BookAlt },
  userRating: { base: icon.Star },
  pageCount: { base: icon.FileText },
  duration: { base: icon.Clock },
  fileSize: { base: icon.Database },
  readingPosition: { base: icon.Bookmark },
  alignmentConfidence: { base: icon.ChartBar },
  alignmentSentenceCoverage: { base: icon.TextGrammar },
  alignmentAudioCoverage: { base: icon.Volume },
  publicationDate: { base: icon.Calendar },
  createdAt: { base: icon.CalendarPlus },
  updatedAt: { base: icon.History },
  alignedAt: { base: icon.CalendarCheck },
  alignedWith: { base: icon.Microphone2 },
  alignedByStorytellerVersion: { base: icon.Stack },
  lastRead: { base: icon.Eye },
  seriesPosition: { base: icon.ListNumbers },
  identifiers: { base: icon.Link },
}

export type { FieldIconKey }

export function fieldIcon(
  field: FieldIconKey,
  variant: "base" | "add" | "remove" | "filled" = "base",
): ComponentType<StyledIconProps> {
  const def = FIELD_ICONS[field] as FieldIconDef | undefined
  if (!def) return isRetiredField(field) ? icon.History : icon.AlertTriangle

  const resolved = def[variant]
  if (resolved) return resolved

  return def.base
}

export function FieldIcon({
  field,
  variant = "base",
  ...props
}: StyledIconProps & {
  field: FieldIconKey
  variant?: "base" | "add" | "remove" | "filled"
}) {
  const Icon = fieldIcon(field, variant)
  return <Icon {...props} />
}
