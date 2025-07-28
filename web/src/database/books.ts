import { UUID } from "@/uuid"
import { db } from "./connection"
import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite"
import {
  ProcessingTaskType,
  ProcessingTaskStatus,
} from "@/apiModels/models/ProcessingStatus"
import { BookEvents } from "@/events"
import { DB } from "./schema"
import { Insertable, Selectable, sql, Updateable } from "kysely"
import { Epub } from "@smoores/epub/node"
import { NewAuthor } from "./authors"
import { NewSeries } from "./series"
import { syncRelations } from "./relations"
import { getDefaultStatus } from "./statuses"

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

  const { uuid } = await db
    .selectFrom("book")
    .select(["uuid"])
    .where("id", "=", bookId)
    .executeTakeFirstOrThrow()

  return uuid
}

export type AuthorToBook = Selectable<DB["authorToBook"]>
export type NewAuthorToBook = Insertable<DB["authorToBook"]>
export type AuthorToBookUpdate = Updateable<DB["authorToBook"]>

export type ProcessingStatus = {
  currentTask: ProcessingTaskType
  progress: number
  status: ProcessingTaskStatus
}

export type BookToCollection = Selectable<DB["bookToCollection"]>
export type NewBookToCollection = Insertable<DB["bookToCollection"]>
export type BookToCollectionUpdate = Updateable<DB["bookToCollection"]>

export type NewTag = Insertable<DB["tag"]>
export type TagUpdate = Updateable<DB["tag"]>

export type BookToTag = Selectable<DB["bookToTag"]>
export type NewBookToTag = Insertable<DB["bookToTag"]>
export type BookToTagUpdate = Updateable<DB["bookToTag"]>

export type BookToSeries = Selectable<DB["bookToSeries"]>
export type NewBookToSeries = Insertable<DB["bookToSeries"]>
export type BookToSeriesUpdate = Updateable<DB["bookToSeries"]>

export type AuthorRelation = NewAuthor &
  Omit<NewAuthorToBook, "authorUuid" | "bookUuid">
export type SeriesRelation = NewSeries &
  Omit<NewBookToSeries, "bookUuid" | "seriesUuid">
export type TagRelation = NewTag & NewBookToTag

export type NewEbook = Insertable<DB["ebook"]>
export type Ebook = Selectable<DB["ebook"]>
export type EbookUpdate = Updateable<DB["ebook"]>

export type NewAudiobook = Insertable<DB["audiobook"]>
export type Audiobook = Selectable<DB["audiobook"]>
export type AudiobookUpdate = Updateable<DB["audiobook"]>

export type NewAlignedBook = Insertable<DB["readaloud"]>
export type AlignedBook = Selectable<DB["readaloud"]>
export type AlignedBookUpdate = Updateable<DB["readaloud"]>

export type EbookRelation = Omit<NewEbook, "bookUuid">
export type AudiobookRelation = Omit<NewAudiobook, "bookUuid">
export type AlignedBookRelation = Omit<NewAlignedBook, "bookUuid">

export type Book = Selectable<DB["book"]>
export type NewBook = Insertable<DB["book"]>
export type BookUpdate = Updateable<DB["book"]>

export async function createBookFromEpub(
  epub: Epub,
  {
    uuid,
    title,
  }: {
    uuid?: UUID
    title: string
  },
  relations: {
    authors?: AuthorRelation[]
    series?: SeriesRelation[]
    ebook?: EbookRelation
    audiobook?: AudiobookRelation
    readaloud?: AlignedBookRelation
    collections?: UUID[]
  } = {},
) {
  const epubTitle = await epub.getTitle()
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
  const epubCollections = await epub.getCollections()

  const defaultStatus = await getDefaultStatus()

  return await createBook(
    {
      uuid,
      title: epubTitle ?? title,
      language: language?.toString() ?? null,
      alignedByStorytellerVersion: storytellerVersion?.value ?? null,
      alignedAt: storytellerMediaOverlaysModified?.value ?? null,
      alignedWith: storytellerMediaOverlaysEngine?.value ?? null,
      statusUuid: defaultStatus.uuid,
    },
    {
      ...relations,
      authors: authors.map((author) => ({
        name: author.name,
        role: author.role ?? null,
        fileAs: author.fileAs ?? author.name,
      })),
      series: epubCollections
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
  relations: {
    authors?: AuthorRelation[]
    series?: SeriesRelation[]
    ebook?: EbookRelation
    audiobook?: AudiobookRelation
    readaloud?: AlignedBookRelation
    collections?: UUID[]
  } = {},
) {
  const { uuid } = await db
    .insertInto("book")
    .values({ ...insert, id: sql`ABS(RANDOM()) % 9007199254740990 + 1` })
    .returning(["uuid as uuid"])
    .executeTakeFirstOrThrow()

  if (relations.authors) {
    await syncRelations({
      entityUuid: uuid,
      relations: relations.authors,
      relatedTable: "author",
      relationTable: "authorToBook",
      relatedPrimaryKeyColumn: "uuid",
      identifierColumn: "name",
      relatedForeignKeyColumn: "authorToBook.authorUuid",
      entityForeignKeyColumn: "authorToBook.bookUuid",
      extractRelatedValues: (values) => ({
        name: values.name ?? "",
        fileAs: values.fileAs ?? "",
      }),
      extractRelationValues: (authorUuid, values) => ({
        authorUuid: authorUuid,
        bookUuid: uuid,
        role: values.role,
      }),
      extractRelationUpdateValues: (values) => ({
        role: values.role,
      }),
    })
  }

  if (relations.series) {
    await syncRelations({
      entityUuid: uuid,
      relations: relations.series,
      relatedTable: "series",
      relationTable: "bookToSeries",
      relatedPrimaryKeyColumn: "uuid",
      identifierColumn: "name",
      relatedForeignKeyColumn: "bookToSeries.seriesUuid",
      entityForeignKeyColumn: "bookToSeries.bookUuid",
      extractRelatedValues: (values) => ({
        name: values.name ?? "",
        description: values.description,
      }),
      extractRelationValues: (seriesUuid, values) => ({
        seriesUuid: seriesUuid,
        bookUuid: uuid,
        position: values.position,
        featured: values.featured,
      }),
      extractRelationUpdateValues: (values) => ({
        position: values.position,
        featured: values.featured,
      }),
    })
  }

  if (relations.readaloud) {
    await db
      .insertInto("readaloud")
      .values({ ...relations.readaloud, bookUuid: uuid })
      .execute()
  }

  if (relations.ebook) {
    await db
      .insertInto("ebook")
      .values({ ...relations.ebook, bookUuid: uuid })
      .execute()
  }

  if (relations.audiobook) {
    await db
      .insertInto("audiobook")
      .values({ ...relations.audiobook, bookUuid: uuid })
      .execute()
  }

  if (relations.collections?.length) {
    const collections = relations.collections
    await db
      .insertInto("bookToCollection")
      .columns(["bookUuid", "collectionUuid"])
      .expression((eb) =>
        eb
          .selectFrom(() =>
            collections
              .map((collection) =>
                db
                  .selectNoFrom([
                    eb.val(uuid).as("bookUuid"),
                    eb.val(collection).as("collectionUuid"),
                  ])
                  .where((web) =>
                    web.not(
                      web.exists(
                        web
                          .selectFrom("bookToCollection")
                          .select([web.lit(1).as("one")])
                          .where("bookUuid", "=", uuid)
                          .where("collectionUuid", "=", collection),
                      ),
                    ),
                  ),
              )
              .reduce((acc, expr) => acc.unionAll(expr))
              .as("values"),
          )
          .selectAll(),
      )
      .execute()
  }

  const book = await getBook(uuid)

  if (!book) {
    throw new Error("Failed te create book")
  }

  BookEvents.emit("message", {
    type: "bookCreated",
    bookUuid: book.uuid,
    payload: {
      ...book,
      processingStatus: null,
    },
  })

  return book
}

export function booksQuery(userId?: UUID) {
  return db
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
            "bookToSeries.featured",
            "bookToSeries.position",
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
          .whereRef("bookToTag.bookUuid", "=", "book.uuid"),
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
            "collection.description",
            "collection.public",
            "collection.importPath",
            "collection.createdAt",
            "collection.updatedAt",
          ])
          .whereRef("bookToCollection.bookUuid", "=", "book.uuid"),
      ).as("collections"),
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
      jsonObjectFrom(
        eb
          .selectFrom("ebook")
          .select([
            "ebook.uuid",
            "ebook.filepath",
            "ebook.missing",
            "ebook.createdAt",
            "ebook.updatedAt",
          ])
          .whereRef("ebook.bookUuid", "=", "book.uuid"),
      ).as("ebook"),
      jsonObjectFrom(
        eb
          .selectFrom("audiobook")
          .select([
            "audiobook.uuid",
            "audiobook.filepath",
            "audiobook.missing",
            "audiobook.createdAt",
            "audiobook.updatedAt",
          ])
          .whereRef("audiobook.bookUuid", "=", "book.uuid"),
      ).as("audiobook"),
      jsonObjectFrom(
        eb
          .selectFrom("readaloud")
          .select([
            "readaloud.uuid",
            "readaloud.filepath",
            "readaloud.missing",
            "readaloud.status",
            "readaloud.createdAt",
            "readaloud.updatedAt",
          ])
          .whereRef("readaloud.bookUuid", "=", "book.uuid"),
      ).as("readaloud"),
    ])
    .$if(!!userId, (qb) =>
      qb
        .leftJoin("bookToCollection", "book.uuid", "bookToCollection.bookUuid")
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
}

export async function getAlignedReadaloudBooks(userId?: UUID) {
  return await booksQuery(userId)
    .innerJoin("readaloud", "readaloud.bookUuid", "book.uuid")
    .where("readaloud.status", "=", "ALIGNED")
    .execute()
}

export async function getBooks(bookUuids: UUID[] | null = null, userId?: UUID) {
  const books = await booksQuery(userId)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    .$if(!!bookUuids, (qb) => qb.where("book.uuid", "in", bookUuids!))
    .execute()

  return books
}

export type BookWithRelations = NonNullable<Awaited<ReturnType<typeof getBook>>>

export async function getBook(uuid: UUID, userId?: UUID) {
  const [book] = await getBooks([uuid], userId)
  return book ?? null
}

export async function getBookOrThrow(uuid: UUID) {
  const book = await getBook(uuid)
  if (!book) throw new Error(`No book found with uuid ${uuid}`)
  return book
}

export async function deleteBook(bookUuid: UUID) {
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

  await db.deleteFrom("readaloud").where("bookUuid", "=", bookUuid).execute()
  await db.deleteFrom("audiobook").where("bookUuid", "=", bookUuid).execute()
  await db.deleteFrom("ebook").where("bookUuid", "=", bookUuid).execute()

  await db.deleteFrom("book").where("uuid", "=", bookUuid).execute()

  BookEvents.emit("message", {
    type: "bookDeleted",
    bookUuid,
    payload: undefined,
  })
}

export type BookRelationsUpdate = {
  authors?: AuthorRelation[]
  series?: SeriesRelation[]
  collections?: UUID[]
  tags?: string[]
  ebook?: EbookRelation
  audiobook?: AudiobookRelation
  readaloud?: AlignedBookRelation
  books?: UUID[]
}

export async function updateBook(
  uuid: UUID,
  update: BookUpdate | null,
  relations: BookRelationsUpdate = {},
) {
  if (update) {
    await db.updateTable("book").set(update).where("uuid", "=", uuid).execute()
  }

  if (relations.authors) {
    await syncRelations({
      entityUuid: uuid,
      relations: relations.authors,
      relatedTable: "author",
      relationTable: "authorToBook",
      relatedPrimaryKeyColumn: "uuid",
      identifierColumn: "name",
      relatedForeignKeyColumn: "authorToBook.authorUuid",
      entityForeignKeyColumn: "authorToBook.bookUuid",
      extractRelatedValues: (values) => ({
        name: values.name ?? "",
        fileAs: values.fileAs ?? "",
      }),
      extractRelationValues: (authorUuid, values) => ({
        authorUuid: authorUuid,
        bookUuid: uuid,
        role: values.role,
      }),
      extractRelationUpdateValues: (values) => ({
        role: values.role,
      }),
    })
  }

  if (relations.series) {
    await syncRelations({
      entityUuid: uuid,
      relations: relations.series,
      relatedTable: "series",
      relationTable: "bookToSeries",
      relatedPrimaryKeyColumn: "uuid",
      identifierColumn: "name",
      relatedForeignKeyColumn: "bookToSeries.seriesUuid",
      entityForeignKeyColumn: "bookToSeries.bookUuid",
      extractRelatedValues: (values) => ({
        name: values.name ?? "",
        description: values.description,
      }),
      extractRelationValues: (seriesUuid, values) => ({
        seriesUuid: seriesUuid,
        bookUuid: uuid,
        position: values.position,
        featured: values.featured,
      }),
      extractRelationUpdateValues: (values) => ({
        position: values.position,
        featured: values.featured,
      }),
    })
  }

  if (relations.collections) {
    const collections = relations.collections
    if (collections.length) {
      await db
        .insertInto("bookToCollection")
        .columns(["bookUuid", "collectionUuid"])
        .expression((eb) =>
          eb
            .selectFrom(() =>
              collections
                .map((collection) =>
                  db
                    .selectNoFrom([
                      eb.val(uuid).as("bookUuid"),
                      eb.val(collection).as("collectionUuid"),
                    ])
                    .where((web) =>
                      web.not(
                        web.exists(
                          web
                            .selectFrom("bookToCollection")
                            .select([web.lit(1).as("one")])
                            .where("bookUuid", "=", uuid)
                            .where("collectionUuid", "=", collection),
                        ),
                      ),
                    ),
                )
                .reduce((acc, expr) => acc.unionAll(expr))
                .as("values"),
            )
            .selectAll(),
        )
        .execute()
    }

    await db
      .deleteFrom("bookToCollection")
      .where("bookUuid", "=", uuid)
      .where("collectionUuid", "not in", relations.collections)
      .execute()
  }

  if (relations.tags) {
    const tags = relations.tags
    if (tags.length) {
      await db
        .insertInto("tag")
        .columns(["name"])
        .expression((eb) =>
          eb
            .selectFrom(() =>
              tags
                .map((tag) =>
                  db.selectNoFrom([eb.val(tag).as("name")]).where((web) =>
                    web.not(
                      web.exists(
                        web
                          .selectFrom("tag")
                          .select([web.lit(1).as("one")])
                          .where("tag.name", "=", tag),
                      ),
                    ),
                  ),
                )
                .reduce((acc, expr) => acc.unionAll(expr))
                .as("values"),
            )
            .selectAll(),
        )
        .execute()

      await db
        .insertInto("bookToTag")
        .columns(["bookUuid", "tagUuid"])
        .expression((eb) =>
          eb
            .selectFrom(() =>
              tags
                .map((tag) =>
                  eb
                    .selectFrom("tag")
                    .select([
                      eb.val(uuid).as("bookUuid"),
                      "tag.uuid as tagUuid",
                    ])
                    .where("tag.name", "=", tag)
                    .where((web) =>
                      web.not(
                        web.exists(
                          web
                            .selectFrom("bookToTag")
                            .select([web.lit(1).as("one")])
                            .innerJoin("tag", "tag.uuid", "tagUuid")
                            .where("bookUuid", "=", uuid)
                            .where("tag.name", "=", tag),
                        ),
                      ),
                    ),
                )
                .reduce((acc, expr) => acc.unionAll(expr))
                .as("values"),
            )
            .selectAll(),
        )
        .execute()
    }

    await db
      .deleteFrom("bookToTag")
      .where("bookUuid", "=", uuid)
      .where((web) =>
        web(
          "tagUuid",
          "not in",
          web.selectFrom("tag").select(["uuid"]).where("tag.name", "in", tags),
        ),
      )
      .execute()
  }

  if (relations.ebook) {
    const existing = await db
      .selectFrom("ebook")
      .select(["uuid"])
      .where("bookUuid", "=", uuid)
      .executeTakeFirst()

    if (existing) {
      await db
        .updateTable("ebook")
        .set({ filepath: relations.ebook.filepath })
        .where("uuid", "=", existing.uuid)
        .execute()
    } else {
      await db
        .insertInto("ebook")
        .values({ bookUuid: uuid, filepath: relations.ebook.filepath })
        .execute()
    }
  }

  if (relations.audiobook) {
    const existing = await db
      .selectFrom("audiobook")
      .select(["uuid"])
      .where("bookUuid", "=", uuid)
      .executeTakeFirst()

    if (existing) {
      await db
        .updateTable("audiobook")
        .set({ filepath: relations.audiobook.filepath })
        .where("uuid", "=", existing.uuid)
        .execute()
    } else {
      await db
        .insertInto("audiobook")
        .values({ bookUuid: uuid, filepath: relations.audiobook.filepath })
        .execute()
    }
  }

  if (relations.readaloud) {
    const existing = await db
      .selectFrom("readaloud")
      .select(["uuid"])
      .where("bookUuid", "=", uuid)
      .executeTakeFirst()

    if (existing) {
      await db
        .updateTable("readaloud")
        .set({ filepath: relations.readaloud.filepath })
        .where("uuid", "=", existing.uuid)
        .execute()
    } else {
      await db
        .insertInto("readaloud")
        .values({ bookUuid: uuid, filepath: relations.readaloud.filepath })
        .execute()
    }
  }

  if (relations.books) {
    await db
      .updateTable("ebook")
      .set({ bookUuid: uuid })
      .where("bookUuid", "in", relations.books)
      .execute()

    await db
      .updateTable("audiobook")
      .set({ bookUuid: uuid })
      .where("bookUuid", "in", relations.books)
      .execute()

    await db
      .updateTable("readaloud")
      .set({ bookUuid: uuid })
      .where("bookUuid", "in", relations.books)
      .execute()

    await db
      .updateTable("position")
      .set({ bookUuid: uuid })
      .where("bookUuid", "in", relations.books)
      .execute()

    for (const bookUuid of relations.books) {
      await deleteBook(bookUuid)
    }
  }

  const book = await getBook(uuid)
  if (!book) throw new Error(`Failed to retrieve book with uuid ${uuid}`)

  BookEvents.emit("message", {
    type: "bookUpdated",
    bookUuid: uuid,
    payload: book,
  })

  return book
}
