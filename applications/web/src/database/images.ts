import { type Selectable } from "kysely"

import { type UUID } from "@/uuid"

import { db } from "./connection"
import { type StoredCoverColor } from "./coverColors"
import { type DB } from "./schema"

export type Image = Selectable<DB["image"]>

export type CoverOrigin = "unset" | "extracted" | "user" | "cleared"

export type CoverFormat = "ebook" | "audiobook" | "readaloud"

export const COVER_FORMATS: readonly CoverFormat[] = [
  "ebook",
  "audiobook",
  "readaloud",
]

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

export async function getImage(uuid: UUID): Promise<Image | null> {
  const row = await db
    .selectFrom("image")
    .selectAll()
    .where("uuid", "=", uuid)
    .executeTakeFirst()

  return row ?? null
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

export type ImageReference = {
  format: CoverFormat
  bookUuid: UUID
}

export async function getImageReferences(
  uuid: UUID,
): Promise<ImageReference[]> {
  const [ebooks, audiobooks, readalouds] = await Promise.all([
    db
      .selectFrom("ebook")
      .select("bookUuid")
      .where("coverImageUuid", "=", uuid)
      .execute(),
    db
      .selectFrom("audiobook")
      .select("bookUuid")
      .where("coverImageUuid", "=", uuid)
      .execute(),
    db
      .selectFrom("readaloud")
      .select("bookUuid")
      .where("coverImageUuid", "=", uuid)
      .execute(),
  ])

  return [
    ...ebooks.map((row) => ({ format: "ebook" as const, ...row })),
    ...audiobooks.map((row) => ({ format: "audiobook" as const, ...row })),
    ...readalouds.map((row) => ({ format: "readaloud" as const, ...row })),
  ]
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
      ]),
    )
    .execute()
}
