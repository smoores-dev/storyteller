import { type BookRelationsUpdate } from "@/database/books"
import { type SerializedManifest } from "@/components/reader/types"

import { type ScanContext } from "@/assets/autoimport/scanner/types"

type EbookRelationPatch = Partial<
  Pick<
    NonNullable<BookRelationsUpdate["ebook"]>,
    "missing" | "contentHash" | "manifest" | "pageCount" | "duration" | "fileSize"
  >
>

type AudiobookRelationPatch = Partial<
  Pick<
    NonNullable<BookRelationsUpdate["audiobook"]>,
    "missing" | "contentHash" | "manifest" | "pageCount" | "duration" | "fileSize"
  >
>

type ReadaloudRelationPatch = Partial<
  Pick<
    NonNullable<BookRelationsUpdate["readaloud"]>,
    "missing" | "contentHash" | "manifest" | "pageCount" | "duration" | "fileSize"
  >
>

export function getFormatRelationPatch(
  ctx: ScanContext,
  update: EbookRelationPatch | AudiobookRelationPatch | ReadaloudRelationPatch,
): BookRelationsUpdate {
  switch (ctx.format) {
    case "ebook":
      return {
        ebook: {
          filepath: ctx.filepath,
          ...(update as EbookRelationPatch),
        } as NonNullable<BookRelationsUpdate["ebook"]>,
      }
    case "audiobook":
      return {
        audiobook: {
          filepath: ctx.filepath,
          ...(update as AudiobookRelationPatch),
        } as NonNullable<BookRelationsUpdate["audiobook"]>,
      }
    case "readaloud":
      return {
        readaloud: {
          filepath: ctx.filepath,
          ...(update as ReadaloudRelationPatch),
        } as NonNullable<BookRelationsUpdate["readaloud"]>,
      }
    default: {
      const format: never = ctx.format
      throw new Error(`Invalid format: ${format as string}`)
    }
  }
}

export function normalizeManifestValue(
  value: unknown,
): SerializedManifest | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === "object") {
    return value as SerializedManifest
  }

  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed || trimmed === "null") {
    return null
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (parsed === null || parsed === undefined) {
      return null
    }
    if (typeof parsed === "string") {
      return normalizeManifestValue(parsed)
    }
    if (typeof parsed === "object") {
      return parsed as SerializedManifest
    }
    return null
  } catch {
    return null
  }
}

export function getNumericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value !== "string") {
    return null
  }

  const parsed = parseFloat(value)
  if (!Number.isFinite(parsed)) {
    return null
  }

  return parsed
}
