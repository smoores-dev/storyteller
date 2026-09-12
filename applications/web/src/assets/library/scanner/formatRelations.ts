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
    | "coverImageUuid"
    | "coverOrigin"
    | "coverExtractedFrom"
  >
>

type AudiobookRelationPatch = Partial<
  Pick<
    NonNullable<BookRelationsUpdate["audiobook"]>,
    | "missing"
    | "manifest"
    | "duration"
    | "fileSize"
    | "fingerprint"
    | "coverImageUuid"
    | "coverOrigin"
    | "coverExtractedFrom"
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
    | "coverImageUuid"
    | "coverOrigin"
    | "coverExtractedFrom"
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
        // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- tsgolint treats the cast as unnecessary but it still narrows the type
        ebook: {
          filepath: ctx.filepath,
          ...(update as EbookRelationPatch),
        } as NonNullable<BookRelationsUpdate["ebook"]>,
      }
    case "audiobook":
      return {
        // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- tsgolint treats the cast as unnecessary but it still narrows the type
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
