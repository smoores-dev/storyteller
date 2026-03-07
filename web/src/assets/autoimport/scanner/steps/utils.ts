import { type BookRelationsUpdate } from "@/database/books"

import { type ScanContext } from "../types"

type EbookRelationPatch = Partial<
  Pick<
    NonNullable<BookRelationsUpdate["ebook"]>,
    "missing" | "contentHash" | "manifest"
  >
>

type AudiobookRelationPatch = Partial<
  Pick<
    NonNullable<BookRelationsUpdate["audiobook"]>,
    "missing" | "contentHash" | "manifest"
  >
>

type ReadaloudRelationPatch = Partial<
  Pick<
    NonNullable<BookRelationsUpdate["readaloud"]>,
    "missing" | "contentHash" | "manifest"
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
        },
      }
    case "audiobook":
      return {
        audiobook: {
          filepath: ctx.filepath,
          ...(update as AudiobookRelationPatch),
        },
      }
    case "readaloud":
      return {
        readaloud: {
          filepath: ctx.filepath,
          ...(update as ReadaloudRelationPatch),
        },
      }
    default: {
      const fmt: never = ctx.format
      throw new Error(`Invalid format: ${ctx.format}`)
    }
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
