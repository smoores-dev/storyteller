import { type ScanFormat } from "@/assets/library/scanner/types"
import { type BookRelationsUpdate } from "@/database/books"

type EbookRelationPatch = Partial<
  Pick<
    NonNullable<BookRelationsUpdate["ebook"]>,
    | "missing"
    | "isEpub2"
    | "manifest"
    | "pageCount"
    | "fileSize"
    | "fingerprint"
  >
>

type AudiobookRelationPatch = Partial<
  Pick<
    NonNullable<BookRelationsUpdate["audiobook"]>,
    "missing" | "manifest" | "duration" | "fileSize" | "fingerprint"
  >
>

type ReadaloudRelationPatch = Partial<
  Pick<
    NonNullable<BookRelationsUpdate["readaloud"]>,
    | "missing"
    | "isEpub2"
    | "manifest"
    | "pageCount"
    | "duration"
    | "fileSize"
    | "fingerprint"
    | "status"
    | "currentStage"
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
      const _exhaustive: never = ctx.format

      throw new Error(
        `Cannot build relation patch for unresolved format "${_exhaustive as string}"`,
      )
    }
  }
}
