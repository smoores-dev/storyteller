import { Selectable } from "kysely"
import { DB } from "./schema"
import { db } from "./connection"
import { UUID } from "@/uuid"
import { getBooks } from "./books"
import { BookEvents } from "@/events"

export type Tag = Selectable<DB["tag"]>

export async function getTags() {
  return db.selectFrom("tag").selectAll().execute()
}

export async function addTagsToBooks(bookUuids: UUID[], tagNames: string[]) {
  await db.transaction().execute(async (tr) => {
    const existingTags = await tr
      .selectFrom("tag")
      .select(["uuid", "name"])
      .where("name", "in", tagNames)
      .execute()

    const newTagNames = tagNames.filter(
      (tagName) => !existingTags.some((tag) => tag.name === tagName),
    )

    let newTags: { uuid: UUID; name: string }[] = []
    if (newTagNames.length) {
      newTags = await tr
        .insertInto("tag")
        .values(newTagNames.map((tagName) => ({ name: tagName })))
        .returning(["uuid as uuid", "name as name"])
        .execute()
    }

    let existingBookToTags: {
      tagUuid: UUID
      bookUuid: UUID
    }[] = []
    if (existingTags.length) {
      existingBookToTags = await tr
        .selectFrom("bookToTag")
        .select(["bookToTag.bookUuid", "bookToTag.tagUuid"])
        .where("bookUuid", "in", bookUuids)
        .where(
          "tagUuid",
          "in",
          existingTags.map((tag) => tag.uuid),
        )
        .execute()
    }

    const newBookToTags = existingTags
      .flatMap(({ uuid: tagUuid }) =>
        bookUuids.map((bookUuid) => ({ tagUuid, bookUuid })),
      )
      .filter(({ tagUuid, bookUuid }) =>
        existingBookToTags.every(
          (bookToTag) =>
            tagUuid !== bookToTag.tagUuid || bookUuid !== bookToTag.bookUuid,
        ),
      )

    const bookToTags = newBookToTags.concat(
      newTags.flatMap(({ uuid: tagUuid }) =>
        bookUuids.map((bookUuid) => ({ tagUuid, bookUuid })),
      ),
    )

    if (bookToTags.length) {
      await tr.insertInto("bookToTag").values(bookToTags).execute()
    }
  })

  const tags = await getTags()
  const books = await getBooks(bookUuids)

  books.forEach((book) => {
    BookEvents.emit("message", {
      type: "bookUpdated",
      bookUuid: book.uuid,
      payload: {
        tags: [
          ...book.tags,
          ...tagNames
            .map((tagName) => tags.find((t) => t.name === tagName))
            .filter((t) => !!t),
        ],
      },
    })
  })
}

export async function removeTagsFromBooks(bookUuids: UUID[], tagUuids: UUID[]) {
  await db
    .deleteFrom("bookToTag")
    .where("bookUuid", "in", bookUuids)
    .where("tagUuid", "in", tagUuids)
    .execute()

  const books = await getBooks(bookUuids)

  books.forEach((book) => {
    BookEvents.emit("message", {
      type: "bookUpdated",
      bookUuid: book.uuid,
      payload: {
        tags: book.tags.filter((t) => !tagUuids.includes(t.uuid)),
      },
    })
  })
}
