import {
  type Insertable,
  type Kysely,
  type Selectable,
  type Updateable,
} from "kysely"

import { type UUID } from "@/uuid"

import { db } from "./connection"
import { type DB } from "./schema"

export const IDENTIFIER_KINDS = [
  "doi",
  "asin",
  "audible",
  "isbn-13",
  "hardcover-edition-id",
  "hardcover-book-slug",
  "hardcover-book-id",
] as const
export type IdentifierKind = (typeof IDENTIFIER_KINDS)[number]

const KNOWN_KINDS = new Set<string>(IDENTIFIER_KINDS)

type IdentifierTypeResult = { uuid: UUID; kind: string | null }

/**
 * finds or creates an identifier type for a given scheme
 */
async function resolveIdentifierType(
  tr: Kysely<DB>,
  scheme: string,
): Promise<IdentifierTypeResult> {
  if (KNOWN_KINDS.has(scheme)) {
    const byKind = await tr
      .selectFrom("identifierType")
      .select(["uuid", "kind"])
      .where("kind", "=", scheme as IdentifierKind)
      .executeTakeFirst()

    if (byKind) {
      return byKind
    }
  }

  const name = scheme.charAt(0).toUpperCase() + scheme.slice(1)

  const existing = await tr
    .selectFrom("identifierType")
    .select(["uuid", "kind"])
    .where("name", "=", name)
    .executeTakeFirst()

  if (existing) {
    return existing
  }

  const created = await tr
    .insertInto("identifierType")
    .values({ name })
    .returning(["uuid", "kind"])
    .executeTakeFirstOrThrow()

  return created
}

export type IdentifierType = Selectable<DB["identifierType"]>
export type NewIdentifierType = Insertable<DB["identifierType"]>
export type IdentifierTypeUpdate = Updateable<DB["identifierType"]>

// export type Identifier = Selectable<DB["identifier"]>
export type NewIdentifier = Insertable<DB["identifier"]>
export type IdentifierUpdate = Updateable<DB["identifier"]>

export async function getIdentifierTypes() {
  return db.selectFrom("identifierType").selectAll().execute()
}

export async function getIdentifierType(uuid: UUID) {
  return db
    .selectFrom("identifierType")
    .selectAll()
    .where("uuid", "=", uuid)
    .executeTakeFirstOrThrow()
}

export async function createIdentifierType(values: NewIdentifierType) {
  return db
    .insertInto("identifierType")
    .values(values)
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function updateIdentifierType(
  uuid: UUID,
  update: IdentifierTypeUpdate,
) {
  await db
    .updateTable("identifierType")
    .set(update)
    .where("uuid", "=", uuid)
    .execute()
}

export async function deleteIdentifierType(uuid: UUID) {
  await db.deleteFrom("identifierType").where("uuid", "=", uuid).execute()
}

export type Identifier = Awaited<ReturnType<typeof getIdentifiers>>[number]

export async function getIdentifiers(bookUuid: UUID) {
  return db
    .selectFrom("identifier")
    .innerJoin(
      "identifierType",
      "identifier.identifierTypeUuid",
      "identifierType.uuid",
    )
    .select([
      "identifier.uuid",
      "identifier.bookUuid",
      "identifier.identifierTypeUuid",
      "identifier.value",
      "identifier.ebookUuid",
      "identifier.audiobookUuid",
      "identifier.readaloudUuid",
      "identifier.createdAt",
      "identifier.updatedAt",
      "identifierType.name as identifierTypeName",
      "identifierType.urlTemplate",
      "identifierType.externalSourceUuid",
    ])
    .where("identifier.bookUuid", "=", bookUuid)
    .execute()
}

export type IdentifierFormat = "ebook" | "audiobook" | "readaloud"

export type ExtractedIdentifiers = {
  format: IdentifierFormat
  entries: { scheme: string; value: string }[]
  replace?: boolean
}

/**
 * Links identifiers extracted from a book's file to its format row.
 */
export async function linkExtractedIdentifiers(
  tr: Kysely<DB>,
  bookUuid: UUID,
  { format, entries, replace }: ExtractedIdentifiers,
) {
  if (!entries.length) return

  const formatRow = await tr
    .selectFrom(
      // narrowing for kysely, otherwise "each member of the union type" errors
      format as "ebook",
    )
    .select("uuid")
    .where("bookUuid", "=", bookUuid)
    .executeTakeFirst()
  if (!formatRow) return

  const formatUuid = formatRow.uuid
  const formatColumn = `${format}Uuid` as const

  if (replace) {
    await tr
      .deleteFrom("identifier")
      .where("bookUuid", "=", bookUuid)
      .where((eb) => eb(formatColumn, "=", formatUuid))
      .execute()
  }

  for (const { scheme, value } of entries) {
    const type = await resolveIdentifierType(tr, scheme)

    const existing = await tr
      .selectFrom("identifier")
      .select("uuid")
      .where("bookUuid", "=", bookUuid)
      .where("identifierTypeUuid", "=", type.uuid)
      .where("value", "=", value)
      .where((eb) => eb(formatColumn, "=", formatUuid))
      .executeTakeFirst()
    if (existing) continue

    await tr
      .insertInto("identifier")
      .values({
        bookUuid,
        identifierTypeUuid: type.uuid,
        value,
        [formatColumn]: formatUuid,
      })
      .execute()
  }
}

export async function mergeIdentifierTypes(
  targetUuid: UUID,
  sourceUuids: UUID[],
) {
  if (!sourceUuids.length) return

  await db.transaction().execute(async (tr) => {
    const rowKey = (row: {
      bookUuid: UUID
      value: string
      ebookUuid: UUID | null
      audiobookUuid: UUID | null
      readaloudUuid: UUID | null
    }) =>
      [
        row.bookUuid,
        row.value,
        row.ebookUuid ?? "",
        row.audiobookUuid ?? "",
        row.readaloudUuid ?? "",
      ].join("|")

    const targetRows = await tr
      .selectFrom("identifier")
      .select([
        "bookUuid",
        "value",
        "ebookUuid",
        "audiobookUuid",
        "readaloudUuid",
      ])
      .where("identifierTypeUuid", "=", targetUuid)
      .execute()
    const existing = new Set(targetRows.map(rowKey))

    const sourceRows = await tr
      .selectFrom("identifier")
      .select([
        "uuid",
        "bookUuid",
        "value",
        "ebookUuid",
        "audiobookUuid",
        "readaloudUuid",
      ])
      .where("identifierTypeUuid", "in", sourceUuids)
      .execute()

    const toMove: UUID[] = []
    for (const row of sourceRows) {
      const key = rowKey(row)
      if (existing.has(key)) continue
      existing.add(key)
      toMove.push(row.uuid)
    }

    if (toMove.length) {
      await tr
        .updateTable("identifier")
        .set({ identifierTypeUuid: targetUuid })
        .where("uuid", "in", toMove)
        .execute()
    }

    await tr
      .deleteFrom("identifierType")
      .where("uuid", "in", sourceUuids)
      .execute()
  })
}

export async function mergeBookIdentifiers(
  tr: Kysely<DB>,
  bookUuid: UUID,
  from: UUID[],
) {
  const bookLevel = await tr
    .selectFrom("identifier")
    .select([
      "uuid",
      "bookUuid",
      "identifierTypeUuid",
      "value",
      (eb) =>
        eb
          .exists(
            eb
              .selectFrom("externalData")
              .select("externalData.uuid")
              .whereRef("externalData.identifierUuid", "=", "identifier.uuid"),
          )
          .as("hasExternalData"),
    ])
    .where("bookUuid", "in", [bookUuid, ...from])
    .where("ebookUuid", "is", null)
    .where("audiobookUuid", "is", null)
    .where("readaloudUuid", "is", null)
    .execute()

  const rank = (row: (typeof bookLevel)[number]) =>
    (row.hasExternalData ? 0 : 2) + (row.bookUuid === bookUuid ? 0 : 1)

  const kept = new Map<string, (typeof bookLevel)[number]>()
  for (const row of bookLevel) {
    const key = `${row.identifierTypeUuid}\u0000${row.value}`
    const current = kept.get(key)
    if (!current || rank(row) < rank(current)) kept.set(key, row)
  }

  const keptUuids = new Set([...kept.values()].map((row) => row.uuid))
  const dropped = bookLevel.filter((row) => !keptUuids.has(row.uuid))

  if (dropped.length) {
    await tr
      .deleteFrom("identifier")
      .where(
        "uuid",
        "in",
        dropped.map((row) => row.uuid),
      )
      .execute()
  }

  await tr
    .updateTable("identifier")
    .set({ bookUuid })
    .where("bookUuid", "in", from)
    .execute()
}
