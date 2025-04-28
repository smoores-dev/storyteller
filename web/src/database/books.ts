import { UUID } from "@/uuid"
import { getDatabase } from "./connection"
import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite"
import {
  ProcessingTaskType,
  ProcessingTaskStatus,
} from "@/apiModels/models/ProcessingStatus"
import { BookEvents } from "@/events"
import { DB } from "./schema"
import { Insertable, Selectable, Updateable } from "kysely"
import { Epub } from "@smoores/epub"

/**
 * This function only exists to support old clients that haven't
 * started using UUIDs yet. It's not particularly efficient and should
 * be removed after we feel confident that all clients (specifically,
 * mobile apps) have likely been updated.
 */
export async function getBookUuid(bookIdOrUuid: string): Promise<UUID> {
  if (bookIdOrUuid.includes("-")) {
    // This is already a UUID, so just return it
    return bookIdOrUuid as UUID
  }

  // Otherwise, parse into an int and fetch the UUID from the db
  const bookId = parseInt(bookIdOrUuid, 10)

  const db = getDatabase()
  const { uuid } = await db
    .selectFrom("book")
    .select(["uuid"])
    .where("id", "=", bookId)
    .executeTakeFirstOrThrow()

  return uuid
}

export type Author = Selectable<DB["author"]>
export type NewAuthor = Insertable<DB["author"]>
export type AuthorUpdate = Updateable<DB["author"]>

export type AuthorToBook = Selectable<DB["authorToBook"]>
export type NewAuthorToBook = Insertable<DB["authorToBook"]>
export type AuthorToBookUpdate = Updateable<DB["authorToBook"]>

export type ProcessingStatus = {
  currentTask: ProcessingTaskType
  progress: number
  status: ProcessingTaskStatus
}

export type Series = Selectable<DB["series"]>
export type NewSeries = Insertable<DB["series"]>
export type SeriesUpdate = Updateable<DB["series"]>

export type BookToSeries = Selectable<DB["bookToSeries"]>
export type NewBookToSeries = Insertable<DB["bookToSeries"]>
export type BookToSeriesUpdate = Updateable<DB["bookToSeries"]>

export type Status = Selectable<DB["status"]>

export type Book = Selectable<DB["book"]>
export type NewBook = Insertable<DB["book"]>
export type BookUpdate = Updateable<DB["book"]>

export async function createBookFromEpub(epub: Epub, fallbackTitle: string) {
  const title = await epub.getTitle()
  const authors = await epub.getCreators()
  const language = await epub.getLanguage()
  const storytellerVersion = await epub.findMetadataItem(
    (item) =>
      item.properties["property"] === "storyteller:version" && !!item.value,
  )
  const storytellerMediaOverlaysModified = await epub.findMetadataItem(
    (item) =>
      item.properties["property"] === "storyteller:media-overlays-modified" &&
      !!item.value,
  )
  const storytellerMediaOverlaysEngine = await epub.findMetadataItem(
    (item) =>
      item.properties["property"] === "storyteller:media-overlays-engine" &&
      !!item.value,
  )
  const collections = await epub.getCollections()

  return await createBook(
    {
      title: title ?? fallbackTitle,
      language: language?.toString() ?? null,
      alignedByStorytellerVersion: storytellerVersion?.value ?? null,
      alignedAt: storytellerMediaOverlaysModified?.value ?? null,
      alignedWith: storytellerMediaOverlaysEngine?.value ?? null,
    },
    {
      authors: authors.map((author) => ({
        name: author.name,
        role: author.role ?? null,
        fileAs: author.fileAs ?? author.name,
      })),
      series: collections
        .filter((c) => c.type === "series")
        .map((series, i) => ({
          name: series.name,
          featured: i === 0,
          ...(series.position && { position: parseFloat(series.position) }),
        })),
    },
  )
}

export async function createBook(
  insert: NewBook,
  relations: { authors?: AuthorRelation[]; series?: SeriesRelation[] } = {},
) {
  const db = getDatabase()

  const { uuid } = await db
    .insertInto("book")
    .values(insert)
    .returning(["uuid"])
    .executeTakeFirstOrThrow()

  if (relations.authors) {
    for (const author of relations.authors) {
      let existing = await db
        .selectFrom("author")
        .select(["uuid"])
        .where("name", "=", author.name)
        .executeTakeFirst()

      if (!existing) {
        existing = await db
          .insertInto("author")
          .values(author)
          .returning(["uuid"])
          .executeTakeFirstOrThrow()
      }

      await db
        .insertInto("authorToBook")
        .values({
          authorUuid: existing.uuid,
          bookUuid: uuid,
          role: author.role ?? "aut",
        })
        .execute()

      continue
    }
  }

  if (relations.series) {
    for (const series of relations.series) {
      let existing = await db
        .selectFrom("series")
        .select(["uuid"])
        .where("name", "=", series.name)
        .executeTakeFirst()

      if (!existing) {
        existing = await db
          .insertInto("series")
          .values(series)
          .returning(["uuid"])
          .executeTakeFirstOrThrow()
      }

      await db
        .insertInto("bookToSeries")
        .values({
          seriesUuid: existing.uuid,
          bookUuid: uuid,
          featured: series.featured,
          position: series.position,
        })
        .execute()

      continue
    }
  }

  const book = await getBook(uuid)

  if (!book) {
    throw new Error("Failod te create book")
  }

  BookEvents.emit("message", {
    type: "bookCreated",
    bookUuid: book.uuid,
    payload: {
      ...book,
      originalFilesExist: true,
      processingStatus: null,
    },
  })

  return book
}

export async function getBooks(
  bookUuids: UUID[] | null = null,
  alignedOnly = false,
) {
  const db = getDatabase()

  const books = await db
    .selectFrom("book")
    .selectAll("book")
    .select((eb) => [
      jsonArrayFrom(
        eb
          .selectFrom("author")
          .innerJoin("authorToBook", "authorToBook.authorUuid", "author.uuid")
          .select([
            "author.uuid",
            "author.id",
            "author.name",
            "author.fileAs",
            "authorToBook.role",
            "author.createdAt",
            "author.updatedAt",
          ])
          .whereRef("authorToBook.bookUuid", "=", "book.uuid"),
      ).as("authors"),
      jsonArrayFrom(
        eb
          .selectFrom("series")
          .innerJoin("bookToSeries", "bookToSeries.seriesUuid", "series.uuid")
          .select([
            "series.uuid",
            "series.name",
            "series.createdAt",
            "series.updatedAt",
          ])
          .whereRef("bookToSeries.bookUuid", "=", "book.uuid"),
      ).as("series"),
      jsonArrayFrom(
        eb
          .selectFrom("tag")
          .innerJoin("bookToTag", "bookToTag.tagUuid", "tag.uuid")
          .select(["tag.uuid", "tag.name", "tag.createdAt", "tag.updatedAt"])
          .whereRef("bookToTag.tagUuid", "=", "book.uuid"),
      ).as("tags"),
      jsonArrayFrom(
        eb
          .selectFrom("collection")
          .innerJoin(
            "bookToCollection",
            "bookToCollection.collectionUuid",
            "collection.uuid",
          )
          .select([
            "collection.uuid",
            "collection.name",
            "collection.createdAt",
            "collection.updatedAt",
          ])
          .whereRef("bookToCollection.bookUuid", "=", "book.uuid"),
      ).as("series"),
      jsonObjectFrom(
        eb
          .selectFrom("processingTask")
          .select([
            "processingTask.uuid",
            "processingTask.progress",
            "processingTask.status",
            "processingTask.type",
            "processingTask.createdAt",
            "processingTask.updatedAt",
          ])
          .whereRef("processingTask.bookUuid", "=", "book.uuid")
          .orderBy("processingTask.updatedAt", "desc")
          .limit(1),
      ).as("processingTask"),
      jsonObjectFrom(
        eb
          .selectFrom("status")
          .select([
            "status.uuid",
            "status.name",
            "status.createdAt",
            "status.updatedAt",
          ])
          .whereRef("status.uuid", "=", "book.statusUuid"),
      ).as("status"),
    ])
    .$if(!!bookUuids, (qb) => qb.where("book.uuid", "in", bookUuids))
    .execute()

  if (!alignedOnly) return books

  return books.filter((book) => {
    return (
      book.processingTask?.type === ProcessingTaskType.SYNC_CHAPTERS &&
      book.processingTask.status === ProcessingTaskStatus.COMPLETED
    )
  })
}

export async function getBook(uuid: UUID) {
  const [book] = await getBooks([uuid])
  return book ?? null
}

export async function deleteBook(bookUuid: UUID) {
  const db = getDatabase()

  await db
    .deleteFrom("processingTask")
    .where("bookUuid", "=", bookUuid)
    .execute()

  await db.deleteFrom("authorToBook").where("bookUuid", "=", bookUuid).execute()

  await db
    .deleteFrom("author")
    .whereRef("author.uuid", "not in", (eb) =>
      eb.selectFrom("authorToBook").select(["authorUuid"]),
    )
    .execute()

  await db.deleteFrom("bookToSeries").where("bookUuid", "=", bookUuid).execute()

  await db
    .deleteFrom("series")
    .whereRef("series.uuid", "not in", (eb) =>
      eb.selectFrom("bookToSeries").select(["seriesUuid"]),
    )
    .execute()

  await db.deleteFrom("bookToTag").where("bookUuid", "=", bookUuid).execute()

  await db
    .deleteFrom("bookToCollection")
    .where("bookUuid", "=", bookUuid)
    .execute()

  await db.deleteFrom("position").where("bookUuid", "=", bookUuid).execute()

  await db.deleteFrom("book").where("uuid", "=", bookUuid).execute()

  BookEvents.emit("message", {
    type: "bookDeleted",
    bookUuid,
    payload: undefined,
  })
}

export type AuthorRelation = NewAuthor & NewAuthorToBook
export type SeriesRelation = NewSeries & NewBookToSeries

export async function updateBook(
  uuid: UUID,
  update: BookUpdate | null,
  relations: { authors?: AuthorRelation[]; series?: SeriesRelation[] } = {},
) {
  const db = getDatabase()

  if (update) {
    await db.updateTable("book").set(update).where("uuid", "=", uuid).execute()
  }

  if (relations.authors) {
    for (const author of relations.authors) {
      const { uuid: authorUuid, ...values } = author
      if (!authorUuid) {
        let existing = await db
          .selectFrom("author")
          .select(["uuid"])
          .where("name", "=", values.name)
          .executeTakeFirst()

        if (!existing) {
          existing = await db
            .insertInto("author")
            .values({ name: values.name, fileAs: values.fileAs })
            .returning(["uuid"])
            .executeTakeFirstOrThrow()
        }

        await db
          .insertInto("authorToBook")
          .values({
            authorUuid: existing.uuid,
            bookUuid: uuid,
            role: values.role ?? "aut",
          })
          .execute()

        continue
      }

      await db
        .updateTable("author")
        .set(values)
        .where("uuid", "=", authorUuid)
        .execute()
    }
  }

  if (relations.series) {
    for (const series of relations.series) {
      const { uuid: seriesUuid, ...values } = series
      if (!seriesUuid) {
        let existing = await db
          .selectFrom("series")
          .select(["uuid"])
          .where("name", "=", values.name)
          .executeTakeFirst()

        if (!existing) {
          existing = await db
            .insertInto("series")
            .values({
              name: values.name,
              description: values.description,
            })
            .returning(["uuid"])
            .executeTakeFirstOrThrow()
        }

        await db
          .insertInto("bookToSeries")
          .values({
            seriesUuid: existing.uuid,
            bookUuid: uuid,
            position: values.position,
            featured: values.featured,
          })
          .execute()

        continue
      }

      await db
        .updateTable("series")
        .set(values)
        .where("uuid", "=", seriesUuid)
        .execute()
    }
  }

  const book = await getBook(uuid)
  if (!book) throw new Error(`Failed to retrieve book with uuid ${uuid}`)

  BookEvents.emit("message", {
    type: "bookUpdated",
    bookUuid: uuid,
    payload: {
      title: book.title,
      authors: book.authors.map((author) => ({
        ...author,
        file_as: author.fileAs,
        role: author.role ?? "aut",
      })),
    },
  })

  return book
}
