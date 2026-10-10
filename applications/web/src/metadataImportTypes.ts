import { z } from "zod"

import {
  type BookMetadataCandidate,
  METADATA_PROVIDERS,
} from "@storyteller-platform/nodekit/types"

import { type ImportableField } from "@/fields"
import { normalizeLanguage } from "@/metadata/language"

export const COVER_SIDES = ["text", "audio"] as const
export type CoverSide = (typeof COVER_SIDES)[number]

export const ImportFieldsSchema = z.object({
  title: z.string().min(1).optional(),
  subtitle: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  publicationDate: z.string().nullable().optional(),
  releaseDate: z.string().nullable().optional(),
  authors: z.array(z.string()).optional(),
  narrators: z.array(z.string()).optional(),
  creators: z
    .array(z.object({ name: z.string(), role: z.string() }))
    .optional(),
  series: z
    .array(
      z.object({
        name: z.string(),
        position: z.union([z.string(), z.number()]).nullable().optional(),
      }),
    )
    .optional(),
  tags: z.array(z.string()).optional(),
})
export type ImportFields = z.infer<typeof ImportFieldsSchema>

export const SelectedIdentifierSchema = z.object({
  kind: z.string().min(1),
  value: z.string().min(1),
  provider: z.enum(METADATA_PROVIDERS),
})
export type SelectedIdentifier = z.infer<typeof SelectedIdentifierSchema>

export const ImportSourceSchema = z.object({
  provider: z.enum(METADATA_PROVIDERS),
  id: z.string().min(1),
  region: z.string().optional(),
  editionId: z.string().optional(),
})
export type ImportSource = z.infer<typeof ImportSourceSchema>

export const MetadataImportRequestSchema = z.object({
  fields: ImportFieldsSchema,
  sources: z.array(ImportSourceSchema),
  identifiers: z.array(SelectedIdentifierSchema).default([]),
  ratingProviders: z.array(z.enum(METADATA_PROVIDERS)).default([]),
})
export type MetadataImportRequest = z.infer<typeof MetadataImportRequestSchema>
export type MetadataImportBody = z.input<typeof MetadataImportRequestSchema>

export function extractCandidateTags(
  candidate: BookMetadataCandidate,
  limit = 10,
): string[] {
  const genres = candidate.tags.filter((tag) =>
    /genre/i.test(tag.category ?? ""),
  )
  const pool = genres.length ? genres : candidate.tags
  const sorted = [...pool].sort((a, b) => (b.count ?? 0) - (a.count ?? 0))

  const seen = new Set<string>()
  const names: string[] = []
  for (const tag of sorted) {
    const name = tag.name.trim()
    const key = name.toLowerCase()
    if (!name || name.includes(";") || seen.has(key)) continue
    seen.add(key)
    names.push(name)
    if (names.length >= limit) break
  }
  return names
}

export function candidateFieldValue<Field extends ImportableField>(
  candidate: BookMetadataCandidate,
  field: Field,
): ImportFields[Field] | undefined {
  type Value = ImportFields[Field] | undefined
  switch (field) {
    case "title":
      return (candidate.title || undefined) as Value
    case "subtitle":
      return (candidate.subtitle ?? undefined) as Value
    case "description":
      return (candidate.description ?? undefined) as Value
    case "language":
      return (normalizeLanguage(candidate.language) ?? undefined) as Value
    case "publicationDate":
      return (
        candidate.provider === "hardcover"
          ? (candidate.releaseDate ?? undefined)
          : undefined
      ) as Value
    case "releaseDate":
      return (
        candidate.provider === "audnexus"
          ? (candidate.releaseDate ?? undefined)
          : undefined
      ) as Value
    case "authors":
      return (candidate.authors.length ? candidate.authors : undefined) as Value
    case "narrators":
      return (
        candidate.narrators.length ? candidate.narrators : undefined
      ) as Value
    case "creators":
      return (
        candidate.creators.length ? candidate.creators : undefined
      ) as Value
    case "series":
      return (
        candidate.series.length
          ? candidate.series.map((series) => ({
              name: series.name,
              position: series.position ?? null,
            }))
          : undefined
      ) as Value
    case "tags": {
      const tags = extractCandidateTags(candidate)
      return (tags.length ? tags : undefined) as Value
    }
    default:
      return undefined
  }
}

export function coverSidesOf(book: {
  ebook: unknown
  audiobook: unknown
  readaloud: unknown
}): CoverSide[] {
  return [
    ...(book.ebook || book.readaloud ? (["text"] as const) : []),
    ...(book.audiobook ? (["audio"] as const) : []),
  ]
}
