import { type Selectable, sql } from "kysely"

import { type UUID } from "@/uuid"

import { db } from "./connection"
import { type StoredCoverColor } from "./coverColors"
import { type DB } from "./schema"

export type Image = Selectable<DB["image"]>

export const COVER_ORIGINS = ["unset", "extracted", "user", "cleared"] as const

export type CoverOrigin = (typeof COVER_ORIGINS)[number]

export type CoverFormat = "ebook" | "audiobook" | "readaloud"

/**
 * to exclude uuid,mimeType byteSize from the public shape of an image
 */
export const IMAGE_COLUMNS = [
  "image.sha256",
  "image.width",
  "image.height",
  "image.blurhash",
  "image.colors",
] as const satisfies `image.${keyof DB["image"]}`[]

export type NewImage = {
  sha256: string
  mimeType: string
  width: number
  height: number
  byteSize: number
  blurhash?: string | null
  colors?: StoredCoverColor[] | null
  sourceName?: string | null
}

export async function getImageBySha256(sha256: string): Promise<Image | null> {
  const row = await db
    .selectFrom("image")
    .selectAll()
    .where("sha256", "=", sha256)
    .executeTakeFirst()

  return row ?? null
}

export async function insertImage(image: NewImage): Promise<Image> {
  const existing = await getImageBySha256(image.sha256)
  if (existing) return existing

  return await db
    .insertInto("image")
    .values({
      sha256: image.sha256,
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
      byteSize: image.byteSize,
      blurhash: image.blurhash ?? null,
      colors: image.colors == null ? null : JSON.stringify(image.colors),
      sourceName: image.sourceName ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function deleteImage(uuid: UUID): Promise<void> {
  await db.deleteFrom("image").where("uuid", "=", uuid).execute()
}

export type CoverAttachment = {
  imageUuid: UUID | null
  origin: CoverOrigin
  extractedFrom?: string | null
}

export async function setFormatCover(
  format: CoverFormat,
  bookUuid: UUID,
  attachment: CoverAttachment,
): Promise<void> {
  const values = {
    coverImageUuid: attachment.imageUuid,
    coverOrigin: attachment.origin,
    ...(attachment.extractedFrom !== undefined && {
      coverExtractedFrom: attachment.extractedFrom,
    }),
  }

  switch (format) {
    case "ebook":
      await db
        .updateTable("ebook")
        .set(values)
        .where("bookUuid", "=", bookUuid)
        .execute()
      return
    case "audiobook":
      await db
        .updateTable("audiobook")
        .set(values)
        .where("bookUuid", "=", bookUuid)
        .execute()
      return
    case "readaloud":
      await db
        .updateTable("readaloud")
        .set(values)
        .where("bookUuid", "=", bookUuid)
        .execute()
      return
  }
}

export type FormatCover = {
  coverOrigin: CoverOrigin
  coverExtractedFrom: string | null
}

/**
 * scanner bookkeeping for a format's cover. kept off the book response, so
 * read it here when deciding whether to re-extract.
 */
export async function getFormatCover(
  format: CoverFormat,
  bookUuid: UUID,
): Promise<FormatCover | null> {
  const columns = ["coverOrigin", "coverExtractedFrom"] as const

  switch (format) {
    case "ebook":
      return (
        (await db
          .selectFrom("ebook")
          .select(columns)
          .where("bookUuid", "=", bookUuid)
          .executeTakeFirst()) ?? null
      )
    case "audiobook":
      return (
        (await db
          .selectFrom("audiobook")
          .select(columns)
          .where("bookUuid", "=", bookUuid)
          .executeTakeFirst()) ?? null
      )
    case "readaloud":
      return (
        (await db
          .selectFrom("readaloud")
          .select(columns)
          .where("bookUuid", "=", bookUuid)
          .executeTakeFirst()) ?? null
      )
  }
}

export type ImageReference = {
  format: CoverFormat
  bookUuid: UUID
}

export async function getUnreferencedImages(): Promise<
  Pick<Image, "uuid" | "sha256">[]
> {
  return await db
    .selectFrom("image")
    .select(["uuid", "sha256"])
    .where((eb) =>
      eb.and([
        eb.not(
          eb.exists(
            eb
              .selectFrom("ebook")
              .select((inner) => inner.lit(1).as("one"))
              .whereRef("ebook.coverImageUuid", "=", "image.uuid"),
          ),
        ),
        eb.not(
          eb.exists(
            eb
              .selectFrom("audiobook")
              .select((inner) => inner.lit(1).as("one"))
              .whereRef("audiobook.coverImageUuid", "=", "image.uuid"),
          ),
        ),
        eb.not(
          eb.exists(
            eb
              .selectFrom("readaloud")
              .select((inner) => inner.lit(1).as("one"))
              .whereRef("readaloud.coverImageUuid", "=", "image.uuid"),
          ),
        ),
        eb.not(
          eb.exists(
            eb
              .selectFrom("settings")
              .select((inner) => inner.lit(1).as("one"))
              .where("settings.name", "=", "serverIconSha256")
              .whereRef(
                "settings.value",
                "=",
                sql<string>`'"' || image.sha256 || '"'`,
              ),
          ),
        ),
      ]),
    )
    .execute()
}
