import { type ScanFormat } from "@/assets/library/scanner/types"
import { type BookRelationsUpdate } from "@/database/books"

type EbookRelationPatch = Partial<
  Pick<
    NonNullable<BookRelationsUpdate["ebook"]>,
    | "missing"
    | "isEpub2"
    | "contentHash"
    | "manifest"
    | "pageCount"
    | "duration"
    | "fileSize"
  >
>

type AudiobookRelationPatch = Partial<
  Pick<
    NonNullable<BookRelationsUpdate["audiobook"]>,
    | "missing"
    | "contentHash"
    | "manifest"
    | "pageCount"
    | "duration"
    | "fileSize"
  >
>

type ReadaloudRelationPatch = Partial<
  Pick<
    NonNullable<BookRelationsUpdate["readaloud"]>,
    | "missing"
    | "isEpub2"
    | "contentHash"
    | "manifest"
    | "pageCount"
    | "duration"
    | "fileSize"
  >
>

type FormatRelationPatch =
  | EbookRelationPatch
  | AudiobookRelationPatch
  | ReadaloudRelationPatch

type FormatRelationContext = {
  format: ScanFormat
  filepath: string
}

export function getFormatRelationPatch(
  ctx: FormatRelationContext,
  update: FormatRelationPatch,
): BookRelationsUpdate {
  if (ctx.format === "ebook") {
    return {
      ebook: {
        filepath: ctx.filepath,
        ...(update as EbookRelationPatch),
      } as NonNullable<BookRelationsUpdate["ebook"]>,
    }
  }

  if (ctx.format === "audiobook") {
    return {
      audiobook: {
        filepath: ctx.filepath,
        ...(update as AudiobookRelationPatch),
      } as NonNullable<BookRelationsUpdate["audiobook"]>,
    }
  }

  if (ctx.format === "readaloud") {
    return {
      readaloud: {
        filepath: ctx.filepath,
        ...(update as ReadaloudRelationPatch),
      } as NonNullable<BookRelationsUpdate["readaloud"]>,
    }
  }

  throw new Error(
    `Cannot build relation patch for unresolved format "${ctx.format}"`,
  )
}
