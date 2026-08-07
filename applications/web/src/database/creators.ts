import {
  type Insertable,
  type Selectable,
  type Updateable,
  sql,
} from "kysely"

import { type Role } from "@/components/books/edit/marcRelators"
import { BookEvents } from "@/events"
import { type UUID } from "@/uuid"

import { getBooks } from "./books"
import { db } from "./connection"
import { type DB } from "./schema"
import { cleanShelfFiltersForDeletedEntity } from "./shelfFilter"

export type Creator = Selectable<DB["creator"]>
export type NewCreator = Insertable<DB["creator"]>
export type CreatorUpdate = Updateable<DB["creator"]>

export async function getCreators(
  userId?: UUID,
  role?: Role,
): Promise<(Creator & { roles: Role[] })[]> {
  return (
    db
      .selectFrom("creator")
      .innerJoin("bookToCreator", "bookToCreator.creatorUuid", "creator.uuid")
      // every role the creator holds, once each, nulls dropped
      .select((eb) =>
        eb.fn
          .agg<Role[]>("json_group_array", ["bookToCreator.role"])
          .distinct()
          .filterWhere("bookToCreator.role", "is not", null)
          .as("roles"),
      )
      // filtering by role narrows which creators come back, but each one still
      // reports its full role set, so having beats a where here
      .$if(!!role, (qb) =>
        qb.having(
          sql<number>`sum(${sql.ref("bookToCreator.role")} = ${role})`,
          ">",
          0,
        ),
      )
      .$if(!!userId, (qb) =>
        qb
          .leftJoin(
            "bookToCollection",
            "bookToCreator.bookUuid",
            "bookToCollection.bookUuid",
          )
          .leftJoin(
            "collection",
            "collection.uuid",
            "bookToCollection.collectionUuid",
          )
          .leftJoin(
            "collectionToUser",
            "collectionToUser.collectionUuid",
            "bookToCollection.collectionUuid",
          )
          .where((eb) =>
            eb.or([
              // The $if condition ensures that this only runs when userId
              // is not null
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              eb("collectionToUser.userId", "=", userId!),
              eb("collection.public", "=", true),
              eb("collection.public", "is", null),
            ]),
          ),
      )
      .groupBy("creator.uuid")
      .selectAll("creator")
      .execute()
  )
}

export async function updateCreator(uuid: UUID, update: CreatorUpdate) {
  await db.updateTable("creator").set(update).where("uuid", "=", uuid).execute()

  return await db
    .selectFrom("creator")
    .selectAll()
    .where("uuid", "=", uuid)
    .executeTakeFirstOrThrow()
}

export async function deleteCreator(uuid: UUID) {
  const affectedBookUuids = await db.transaction().execute(async (tr) => {
    const rows = await tr
      .selectFrom("bookToCreator")
      .select(["bookUuid"])
      .where("creatorUuid", "=", uuid)
      .execute()

    await tr
      .deleteFrom("bookToCreator")
      .where("creatorUuid", "=", uuid)
      .execute()

    await tr.deleteFrom("creator").where("uuid", "=", uuid).execute()

    return rows.map((r) => r.bookUuid)
  })

  await cleanShelfFiltersForDeletedEntity("creator", uuid)

  if (affectedBookUuids.length > 0) {
    const books = await getBooks(affectedBookUuids)

    books.forEach((book) => {
      BookEvents.emit("message", {
        type: "bookUpdated",
        bookUuid: book.uuid,
        payload: {
          authors: book.authors,
          narrators: book.narrators,
          creators: book.creators,
        },
      })
    })
  }
}

// a creator to attach: an existing one by uuid, or a new one by name.
export type AddCreatorInput =
  | { uuid: UUID }
  | { name: string; fileAs?: string | null }

// re-read the affected books and emit the fresh creator arrays, so every client
// reconciles the exact result (mirrors deleteCreator/mergeCreators).
async function emitBookCreatorUpdates(bookUuids: UUID[]) {
  if (!bookUuids.length) return
  const books = await getBooks(bookUuids)
  books.forEach((book) => {
    BookEvents.emit("message", {
      type: "bookUpdated",
      bookUuid: book.uuid,
      payload: {
        authors: book.authors,
        narrators: book.narrators,
        creators: book.creators,
      },
    })
  })
}

// attach one or more creators (existing or new) to a set of books under a role,
// skipping links that already exist for that (book, creator, role).
export async function addCreatorsToBooks(
  bookUuids: UUID[],
  creators: AddCreatorInput[],
  role: Role,
) {
  await db.transaction().execute(async (tr) => {
    const byId = creators.filter((c): c is { uuid: UUID } => "uuid" in c)
    const byName = creators.filter(
      (c): c is { name: string; fileAs?: string | null } =>
        "name" in c && !!c.name,
    )

    const names = byName.map((c) => c.name)
    const existingByName = names.length
      ? await tr
          .selectFrom("creator")
          .select(["uuid", "name"])
          .where("name", "in", names)
          .execute()
      : []

    const missing = byName.filter(
      (c) => !existingByName.some((e) => e.name === c.name),
    )

    let created: { uuid: UUID }[] = []
    if (missing.length) {
      created = await tr
        .insertInto("creator")
        .values(
          missing.map((c) => ({ name: c.name, fileAs: c.fileAs ?? c.name })),
        )
        .returning(["uuid as uuid"])
        .execute()
    }

    const creatorUuids = [
      ...byId.map((c) => c.uuid),
      ...existingByName.map((c) => c.uuid),
      ...created.map((c) => c.uuid),
    ]
    if (!creatorUuids.length) return

    const existingLinks = await tr
      .selectFrom("bookToCreator")
      .select(["bookUuid", "creatorUuid"])
      .where("bookUuid", "in", bookUuids)
      .where("creatorUuid", "in", creatorUuids)
      .where("role", "=", role)
      .execute()

    const links = creatorUuids
      .flatMap((creatorUuid) =>
        bookUuids.map((bookUuid) => ({ creatorUuid, bookUuid, role })),
      )
      .filter(({ creatorUuid, bookUuid }) =>
        existingLinks.every(
          (l) => l.creatorUuid !== creatorUuid || l.bookUuid !== bookUuid,
        ),
      )

    if (links.length) {
      await tr.insertInto("bookToCreator").values(links).execute()
    }
  })

  await emitBookCreatorUpdates(bookUuids)
}

// detach creators from a set of books for a single role (other roles the same
// creator holds on those books are left intact).
export async function removeCreatorsFromBooks(
  bookUuids: UUID[],
  creatorUuids: UUID[],
  role: Role,
) {
  if (!creatorUuids.length) return
  await db
    .deleteFrom("bookToCreator")
    .where("bookUuid", "in", bookUuids)
    .where("creatorUuid", "in", creatorUuids)
    .where("role", "=", role)
    .execute()

  await emitBookCreatorUpdates(bookUuids)
}

export async function mergeCreators(targetUuid: UUID, sourceUuids: UUID[]) {
  const affectedBookUuids = await db.transaction().execute(async (tr) => {
    // find existing links to the target so we skip duplicates per (book, role)
    const existingLinks = await tr
      .selectFrom("bookToCreator")
      .select(["bookUuid", "role"])
      .where("creatorUuid", "=", targetUuid)
      .execute()

    const existingKey = new Set(
      existingLinks.map((r) => `${r.bookUuid}:${r.role}`),
    )

    // find all links from source creators
    const sourceLinks = await tr
      .selectFrom("bookToCreator")
      .select(["bookUuid", "role"])
      .where("creatorUuid", "in", sourceUuids)
      .execute()

    const toInsert = sourceLinks.filter(
      (r) => !existingKey.has(`${r.bookUuid}:${r.role}`),
    )

    // deduplicate
    const seen = new Set<string>()
    const uniqueToInsert = toInsert.filter((r) => {
      const key = `${r.bookUuid}:${r.role}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    if (uniqueToInsert.length > 0) {
      await tr
        .insertInto("bookToCreator")
        .values(
          uniqueToInsert.map((r) => ({
            bookUuid: r.bookUuid,
            creatorUuid: targetUuid,
            role: r.role,
          })),
        )
        .execute()
    }

    await tr
      .deleteFrom("bookToCreator")
      .where("creatorUuid", "in", sourceUuids)
      .execute()

    await tr.deleteFrom("creator").where("uuid", "in", sourceUuids).execute()

    return [
      ...new Set([
        ...existingLinks.map((r) => r.bookUuid),
        ...sourceLinks.map((r) => r.bookUuid),
      ]),
    ]
  })

  for (const sourceUuid of sourceUuids) {
    await cleanShelfFiltersForDeletedEntity("creator", sourceUuid)
  }

  if (affectedBookUuids.length > 0) {
    const books = await getBooks(affectedBookUuids)

    books.forEach((book) => {
      BookEvents.emit("message", {
        type: "bookUpdated",
        bookUuid: book.uuid,
        payload: {
          authors: book.authors,
          narrators: book.narrators,
          creators: book.creators,
        },
      })
    })
  }
}
