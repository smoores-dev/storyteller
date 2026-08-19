import { type Selectable, sql } from "kysely"

import { BookEvents } from "@/events"
import type { UUID } from "@/uuid"
import { queueWritesToFiles } from "@/writeToFiles/fileWriteDistributor"

import { type TagUpdate, getBooks } from "./books"
import { db } from "./connection"
import type { DB } from "./schema"
import { cleanShelfFiltersForDeletedEntity } from "./shelfFilter"

export type Tag = Selectable<DB["tag"]>

export async function getTags(
  userId?: UUID,
  { order = "asc", limit }: { order?: "asc" | "desc"; limit?: number } = {},
) {
  const query = db
    .selectFrom("tag")
    .$if(!!userId, (qb) =>
      qb
        .innerJoin("bookToTag", "bookToTag.tagUuid", "tag.uuid")
        .leftJoin(
          "bookToCollection",
          "bookToTag.bookUuid",
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
    .groupBy("tag.uuid")
    .selectAll("tag")
    .orderBy(sql`tag.name collate nocase`, order)

  return await (limit !== undefined ? query.limit(limit) : query).execute()
}

export async function getTagByUuid(tagUuid: UUID, userId?: UUID) {
  return db
    .selectFrom("tag")
    .where("tag.uuid", "=", tagUuid)
    .$if(!!userId, (qb) =>
      qb
        .innerJoin("bookToTag", "bookToTag.tagUuid", "tag.uuid")
        .leftJoin(
          "bookToCollection",
          "bookToTag.bookUuid",
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
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            eb("collectionToUser.userId", "=", userId!),
            eb("collection.public", "=", true),
            eb("collection.public", "is", null),
          ]),
        ),
    )
    .groupBy("tag.uuid")
    .selectAll("tag")
    .executeTakeFirst()
}

export async function createTag(values: {
  name: string
  icon?: string | null
  color?: string | null
}) {
  const existing = await db
    .selectFrom("tag")
    .selectAll()
    .where("name", "=", values.name)
    .executeTakeFirst()

  if (existing) return existing

  return await db
    .insertInto("tag")
    .values(values)
    .returningAll()
    .executeTakeFirstOrThrow()
}

export type AddTagInput =
  | { uuid: UUID }
  | { name: string; icon?: string | null; color?: string | null }

export async function addTagsToBooks(bookUuids: UUID[], tags: AddTagInput[]) {
  const byId = tags.filter((t): t is { uuid: UUID } => "uuid" in t)
  const byName = tags.filter(
    (t): t is { name: string; icon?: string | null; color?: string | null } =>
      "name" in t && !!t.name,
  )

  const resolvedTagUuids = await db.transaction().execute(async (tr) => {
    const names = byName.map((t) => t.name)
    const existingByName = names.length
      ? await tr
          .selectFrom("tag")
          .select(["uuid", "name"])
          .where("name", "in", names)
          .execute()
      : []

    const missing = byName.filter(
      (t) => !existingByName.some((e) => e.name === t.name),
    )

    let created: { uuid: UUID; name: string }[] = []
    if (missing.length) {
      created = await tr
        .insertInto("tag")
        .values(
          missing.map((t) => ({
            name: t.name,
            icon: t.icon ?? null,
            color: t.color ?? null,
          })),
        )
        .returning(["uuid as uuid", "name as name"])
        .execute()
    }

    const tagUuids = [
      ...byId.map((t) => t.uuid),
      ...existingByName.map((t) => t.uuid),
      ...created.map((t) => t.uuid),
    ]

    if (!tagUuids.length) return []

    const existingBookToTags = await tr
      .selectFrom("bookToTag")
      .select(["bookToTag.bookUuid", "bookToTag.tagUuid"])
      .where("bookUuid", "in", bookUuids)
      .where("tagUuid", "in", tagUuids)
      .execute()

    const bookToTags = tagUuids
      .flatMap((tagUuid) =>
        bookUuids.map((bookUuid) => ({ tagUuid, bookUuid })),
      )
      .filter(({ tagUuid, bookUuid }) =>
        existingBookToTags.every(
          (bookToTag) =>
            tagUuid !== bookToTag.tagUuid || bookUuid !== bookToTag.bookUuid,
        ),
      )

    if (bookToTags.length) {
      await tr.insertInto("bookToTag").values(bookToTags).execute()
    }

    return tagUuids
  })

  const allTags = await getTags()
  const attached = resolvedTagUuids
    .map((uuid) => allTags.find((t) => t.uuid === uuid))
    .filter((t) => !!t)
  const books = await getBooks(bookUuids)

  books.forEach((book) => {
    const merged = [...book.tags]
    for (const tag of attached) {
      if (!merged.some((t) => t.uuid === tag.uuid)) merged.push(tag)
    }
    BookEvents.emit("message", {
      type: "bookUpdated",
      bookUuid: book.uuid,
      payload: { tags: merged },
    })

    void queueWritesToFiles(book.uuid)
  })
}

export async function removeTagsFromBooks(bookUuids: UUID[], tagUuids: UUID[]) {
  await db.transaction().execute(async (tr) => {
    await tr
      .deleteFrom("bookToTag")
      .where("bookUuid", "in", bookUuids)
      .where("tagUuid", "in", tagUuids)
      .execute()

    await tr
      .deleteFrom("tag")
      .where("tag.uuid", "not in", (eb) =>
        eb.selectFrom("bookToTag").select(["bookToTag.tagUuid"]),
      )
      .execute()
  })

  const books = await getBooks(bookUuids)

  books.forEach((book) => {
    BookEvents.emit("message", {
      type: "bookUpdated",
      bookUuid: book.uuid,
      payload: {
        tags: book.tags.filter((t) => !tagUuids.includes(t.uuid)),
      },
    })

    void queueWritesToFiles(book.uuid)
  })
}

export async function updateTag(uuid: UUID, update: TagUpdate) {
  await db.updateTable("tag").set(update).where("uuid", "=", uuid).execute()

  return await db
    .selectFrom("tag")
    .selectAll()
    .where("uuid", "=", uuid)
    .executeTakeFirstOrThrow()
}

export async function deleteTag(uuid: UUID) {
  const affectedBookUuids = await db.transaction().execute(async (tr) => {
    const rows = await tr
      .selectFrom("bookToTag")
      .select(["bookUuid"])
      .where("tagUuid", "=", uuid)
      .execute()

    await tr.deleteFrom("bookToTag").where("tagUuid", "=", uuid).execute()
    await tr.deleteFrom("tag").where("uuid", "=", uuid).execute()

    return rows.map((r) => r.bookUuid)
  })

  await cleanShelfFiltersForDeletedEntity("tag", uuid)

  if (affectedBookUuids.length > 0) {
    const books = await getBooks(affectedBookUuids)

    books.forEach((book) => {
      BookEvents.emit("message", {
        type: "bookUpdated",
        bookUuid: book.uuid,
        payload: { tags: book.tags },
      })
      void queueWritesToFiles(book.uuid)
    })
  }
}

export async function mergeTags(targetUuid: UUID, sourceUuids: UUID[]) {
  const affectedBookUuids = await db.transaction().execute(async (tr) => {
    const existingLinks = await tr
      .selectFrom("bookToTag")
      .select(["bookUuid"])
      .where("tagUuid", "=", targetUuid)
      .execute()

    const existingSet = new Set(existingLinks.map((r) => r.bookUuid))

    const sourceLinks = await tr
      .selectFrom("bookToTag")
      .select(["bookUuid"])
      .where("tagUuid", "in", sourceUuids)
      .execute()

    const toInsert = sourceLinks
      .filter((r) => !existingSet.has(r.bookUuid))
      .map((r) => r.bookUuid)

    const uniqueToInsert = [...new Set(toInsert)]

    if (uniqueToInsert.length > 0) {
      await tr
        .insertInto("bookToTag")
        .values(
          uniqueToInsert.map((bookUuid) => ({
            bookUuid,
            tagUuid: targetUuid,
          })),
        )
        .execute()
    }

    await tr
      .deleteFrom("bookToTag")
      .where("tagUuid", "in", sourceUuids)
      .execute()

    await tr.deleteFrom("tag").where("uuid", "in", sourceUuids).execute()

    return [
      ...new Set([
        ...existingLinks.map((r) => r.bookUuid),
        ...sourceLinks.map((r) => r.bookUuid),
      ]),
    ]
  })

  for (const sourceUuid of sourceUuids) {
    await cleanShelfFiltersForDeletedEntity("tag", sourceUuid)
  }

  if (affectedBookUuids.length > 0) {
    const books = await getBooks(affectedBookUuids)

    books.forEach((book) => {
      BookEvents.emit("message", {
        type: "bookUpdated",
        bookUuid: book.uuid,
        payload: { tags: book.tags },
      })
      void queueWritesToFiles(book.uuid)
    })
  }
}
