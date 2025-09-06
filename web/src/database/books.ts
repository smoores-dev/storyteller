import {
  type Insertable,
  type Selectable,
  type Transaction,
  type Updateable,
  sql,
} from "kysely"
import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/sqlite"

import { type Audiobook as AudiobookAsset } from "@storyteller-platform/audiobook/node"
import { type Epub } from "@storyteller-platform/epub/node"

import {
  type ProcessingTaskStatus,
  type ProcessingTaskType,
} from "@/apiModels/models/ProcessingStatus"
import {
  getMetadataFromAudiobook,
  getMetadataFromEpub,
} from "@/assets/metadata"
import { BookEvents } from "@/events"
import { type UUID } from "@/uuid"

import { db } from "./connection"
import { type NewCreator } from "./creators"
import { type DB } from "./schema"
import { type NewSeries } from "./series"
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

export type BookToCreator = Selectable<DB["bookToCreator"]>
export type NewBookToCreator = Insertable<DB["bookToCreator"]>
export type BookToCreatorUpdate = Updateable<DB["bookToCreator"]>

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

export type BookToStatus = Selectable<DB["bookToStatus"]>
export type NewBookToStatus = Insertable<DB["bookToStatus"]>
export type BookToStatusUpdate = Updateable<DB["bookToStatus"]>

export type CreatorRelation = NewCreator &
  Omit<NewBookToCreator, "creatorUuid" | "bookUuid">
export type SeriesRelation = NewSeries &
  Omit<NewBookToSeries, "bookUuid" | "seriesUuid">
export type TagRelation = NewTag & NewBookToTag
export type StatusRelation = Omit<NewBookToStatus, "bookUuid">

export type NewEbook = Insertable<DB["ebook"]>
export type Ebook = Selectable<DB["ebook"]>
export type EbookUpdate = Updateable<DB["ebook"]>

export type NewAudiobook = Insertable<DB["audiobook"]>
export type Audiobook = Selectable<DB["audiobook"]>
export type AudiobookUpdate = Updateable<DB["audiobook"]>

export type NewAlignedBook = Insertable<DB["readaloud"]>
export type Readaloud = Selectable<DB["readaloud"]>
export type ReadaloudUpdated = Updateable<DB["readaloud"]>

export type EbookRelation = Omit<NewEbook, "bookUuid">
export type AudiobookRelation = Omit<NewAudiobook, "bookUuid">
export type ReadaloudRelation = Omit<NewAlignedBook, "bookUuid">

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
    ebook?: EbookRelation
    audiobook?: AudiobookRelation
    readaloud?: ReadaloudRelation
    collections?: UUID[]
  } = {},
) {
  const { update, relations: epubRelations } = await getMetadataFromEpub(epub)

  return await createBook(
    {
      uuid,
      ...update,
      title: update?.title ?? title,
    },
    {
      ...relations,
      ...epubRelations,
    },
  )
}

export async function createBookFromAudiobook(
  audiobook: AudiobookAsset,
  {
    uuid,
    title,
  }: {
    uuid?: UUID
    title: string
  },
  relations: {
    ebook?: EbookRelation
    audiobook?: AudiobookRelation
    readaloud?: ReadaloudRelation
    collections?: UUID[]
  } = {},
) {
  const { update, relations: audiobookRelations } =
    await getMetadataFromAudiobook(audiobook)

  return await createBook(
    {
      uuid,
      ...update,
      title: update?.title ?? title,
    },
    {
      ...relations,
      ...audiobookRelations,
    },
  )
}

export async function createBook(
  insert: NewBook,
  relations: {
    creators?: CreatorRelation[]
    tags?: string[]
    series?: SeriesRelation[]
    ebook?: EbookRelation
    audiobook?: AudiobookRelation
    readaloud?: ReadaloudRelation
    collections?: UUID[]
  } = {},
) {
  let uuid!: UUID
  await db.transaction().execute(async (tr) => {
    const row = await tr
      .insertInto("book")
      .values({ ...insert, id: sql`ABS(RANDOM()) % 9007199254740990 + 1` })
      .returning(["uuid as uuid"])
      .executeTakeFirstOrThrow()

    uuid = row.uuid

    if (relations.creators) {
      for (const creator of relations.creators) {
        let existing = await tr
          .selectFrom("creator")
          .select(["uuid"])
          .where((eb) =>
            creator.uuid
              ? eb.or([
                  eb("creator.name", "=", creator.name),
                  eb("creator.uuid", "=", creator.uuid),
                ])
              : eb("creator.name", "=", creator.name),
          )
          .executeTakeFirst()

        if (!existing) {
          existing = await tr
            .insertInto("creator")
            .values({
              name: creator.name,
              fileAs: creator.fileAs,
            })
            .returning(["uuid as uuid"])
            .executeTakeFirstOrThrow()
        }

        await tr
          .insertInto("bookToCreator")
          .values({
            creatorUuid: existing.uuid,
            bookUuid: uuid,
            role: creator.role,
          })
          .execute()
      }
    }

    if (relations.series) {
      for (const series of relations.series) {
        let existing = await tr
          .selectFrom("series")
          .select(["uuid"])
          .where((eb) =>
            series.uuid
              ? eb.or([
                  eb("series.name", "=", series.name),
                  eb("series.uuid", "=", series.uuid),
                ])
              : eb("series.name", "=", series.name),
          )
          .executeTakeFirst()

        if (!existing) {
          existing = await tr
            .insertInto("series")
            .values({
              name: series.name,
              description: series.description,
            })
            .returning(["uuid as uuid"])
            .executeTakeFirstOrThrow()
        }

        await tr
          .insertInto("bookToSeries")
          .values({
            seriesUuid: existing.uuid,
            bookUuid: uuid,
            position: series.position,
            featured: series.featured,
          })
          .execute()
      }
    }

    if (relations.readaloud) {
      await tr
        .insertInto("readaloud")
        .values({ ...relations.readaloud, bookUuid: uuid })
        .execute()
    }

    if (relations.ebook) {
      await tr
        .insertInto("ebook")
        .values({ ...relations.ebook, bookUuid: uuid })
        .execute()
    }

    if (relations.audiobook) {
      await tr
        .insertInto("audiobook")
        .values({ ...relations.audiobook, bookUuid: uuid })
        .execute()
    }

    if (relations.collections?.length) {
      const collections = relations.collections
      await tr
        .insertInto("bookToCollection")
        .columns(["bookUuid", "collectionUuid"])
        .expression((eb) =>
          eb
            .selectFrom(() =>
              collections
                .map((collection) =>
                  tr
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

    if (relations.tags) {
      const tags = relations.tags
      if (tags.length) {
        await tr
          .insertInto("tag")
          .columns(["name"])
          .expression((eb) =>
            eb
              .selectFrom(() =>
                tags
                  .map((tag) =>
                    tr.selectNoFrom([eb.val(tag).as("name")]).where((web) =>
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

        await tr
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
    }

    const defaultStatus = await getDefaultStatus(tr)

    await tr
      .insertInto("bookToStatus")
      .columns(["bookUuid", "statusUuid", "userId"])
      .expression((eb) =>
        eb
          .selectFrom("user")
          .select([
            sql.lit(uuid).as("bookUuid"),
            sql.lit(defaultStatus.uuid).as("statusUuid"),
            "user.id",
          ]),
      )
      .execute()
  })

  const book = await getBook(uuid)

  if (!book) {
    throw new Error("Failed te create book")
  }

  BookEvents.emit("message", {
    type: "bookCreated",
    bookUuid: book.uuid,
    payload: { ...book, status: await getDefaultStatus() },
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
          .selectFrom("creator")
          .distinct()
          .innerJoin(
            "bookToCreator",
            "bookToCreator.creatorUuid",
            "creator.uuid",
          )
          .select([
            "creator.uuid",
            "creator.id",
            "creator.name",
            "creator.fileAs",
            "creator.createdAt",
            "creator.updatedAt",
          ])
          .whereRef("bookToCreator.bookUuid", "=", "book.uuid")
          .where("bookToCreator.role", "=", "aut"),
      ).as("authors"),
      jsonArrayFrom(
        eb
          .selectFrom("creator")
          .distinct()
          .innerJoin(
            "bookToCreator",
            "bookToCreator.creatorUuid",
            "creator.uuid",
          )
          .select([
            "creator.uuid",
            "creator.id",
            "creator.name",
            "creator.fileAs",
            "creator.createdAt",
            "creator.updatedAt",
          ])
          .whereRef("bookToCreator.bookUuid", "=", "book.uuid")
          .where("bookToCreator.role", "=", "nrt"),
      ).as("narrators"),
      jsonArrayFrom(
        eb
          .selectFrom("creator")
          .distinct()
          .innerJoin(
            "bookToCreator",
            "bookToCreator.creatorUuid",
            "creator.uuid",
          )
          .select([
            "creator.uuid",
            "creator.id",
            "creator.name",
            "creator.fileAs",
            "bookToCreator.role",
            "creator.createdAt",
            "creator.updatedAt",
          ])
          .whereRef("bookToCreator.bookUuid", "=", "book.uuid")
          .where("bookToCreator.role", "!=", "nrt")
          .where("bookToCreator.role", "!=", "aut"),
      ).as("creators"),
      jsonArrayFrom(
        eb
          .selectFrom("series")
          .distinct()
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
          .distinct()
          .innerJoin("bookToTag", "bookToTag.tagUuid", "tag.uuid")
          .select(["tag.uuid", "tag.name", "tag.createdAt", "tag.updatedAt"])
          .whereRef("bookToTag.bookUuid", "=", "book.uuid"),
      ).as("tags"),
      jsonArrayFrom(
        eb
          .selectFrom("collection")
          .distinct()
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
      ...(userId
        ? [
            jsonObjectFrom(
              eb
                .selectFrom("status")
                .distinct()
                .select([
                  "status.uuid",
                  "status.name",
                  "status.createdAt",
                  "status.updatedAt",
                ])
                .innerJoin(
                  "bookToStatus",
                  "bookToStatus.statusUuid",
                  "status.uuid",
                )
                .whereRef("bookToStatus.bookUuid", "=", "book.uuid")
                .where("bookToStatus.userId", "=", userId),
            ).as("status"),
            jsonObjectFrom(
              eb
                .selectFrom("position")
                .distinct()
                .select([
                  "position.uuid",
                  "position.locator",
                  "position.timestamp",
                  "position.createdAt",
                  "position.updatedAt",
                ])
                .whereRef("position.bookUuid", "=", "book.uuid")
                .where("position.userId", "=", userId),
            ).as("position"),
          ]
        : []),
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
            "readaloud.currentStage",
            "readaloud.stageProgress",
            "readaloud.queuePosition",
            "readaloud.restartPending",
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
    .groupBy("book.uuid")
}

export async function getAlignedReadaloudBooks(userId?: UUID) {
  return await booksQuery(userId)
    .innerJoin("readaloud", "readaloud.bookUuid", "book.uuid")
    .where("readaloud.filepath", "is not", null)
    .orderBy("readaloud.createdAt", "desc")
    // Fallback to auto-incrementing rowid
    // to break ties in createdAt (which can happen
    // for migrated books)
    .orderBy(sql`book.rowid`, "desc")
    .execute()
}

export async function getQueuedBooks() {
  return await booksQuery()
    .innerJoin("readaloud", "readaloud.bookUuid", "book.uuid")
    .where((qb) =>
      qb.or([
        qb("readaloud.status", "=", "QUEUED"),
        qb("readaloud.status", "=", "PROCESSING"),
      ]),
    )
    .orderBy("readaloud.queuePosition", "asc")
    .execute()
}

export async function getNextQueuePosition() {
  const book = await booksQuery()
    .innerJoin("readaloud", "readaloud.bookUuid", "book.uuid")
    .where((qb) =>
      qb.or([
        qb("readaloud.status", "=", "QUEUED"),
        qb("readaloud.status", "=", "PROCESSING"),
      ]),
    )
    .orderBy("readaloud.queuePosition", "desc")
    .limit(1)
    .executeTakeFirst()

  if (!book) return 0

  const latestPosition = book.readaloud?.queuePosition ?? 0
  return latestPosition + 1
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

export async function deleteBook(bookUuid: UUID, tr?: Transaction<DB>) {
  const callback = async (tr: Transaction<DB>) => {
    await tr
      .deleteFrom("bookToCreator")
      .where("bookUuid", "=", bookUuid)
      .execute()

    await tr
      .deleteFrom("creator")
      .whereRef("creator.uuid", "not in", (eb) =>
        eb.selectFrom("bookToCreator").select(["creatorUuid"]),
      )
      .execute()

    await tr
      .deleteFrom("bookToSeries")
      .where("bookUuid", "=", bookUuid)
      .execute()

    await tr
      .deleteFrom("series")
      .whereRef("series.uuid", "not in", (eb) =>
        eb.selectFrom("bookToSeries").select(["seriesUuid"]),
      )
      .execute()

    await tr.deleteFrom("bookToTag").where("bookUuid", "=", bookUuid).execute()

    await tr
      .deleteFrom("bookToStatus")
      .where("bookUuid", "=", bookUuid)
      .execute()

    await tr
      .deleteFrom("bookToCollection")
      .where("bookUuid", "=", bookUuid)
      .execute()

    await tr.deleteFrom("position").where("bookUuid", "=", bookUuid).execute()

    await tr.deleteFrom("readaloud").where("bookUuid", "=", bookUuid).execute()
    await tr.deleteFrom("audiobook").where("bookUuid", "=", bookUuid).execute()
    await tr.deleteFrom("ebook").where("bookUuid", "=", bookUuid).execute()

    await tr.deleteFrom("book").where("uuid", "=", bookUuid).execute()
  }

  if (tr) {
    await callback(tr)
  } else {
    await db.transaction().execute(callback)
  }

  BookEvents.emit("message", {
    type: "bookDeleted",
    bookUuid,
    payload: undefined,
  })
}

export type BookRelationsUpdate = {
  creators?: CreatorRelation[]
  series?: SeriesRelation[]
  collections?: UUID[]
  tags?: string[]
  ebook?: EbookRelation
  audiobook?: AudiobookRelation
  readaloud?: ReadaloudRelation
  books?: UUID[]
  status?: StatusRelation
}

export async function updateBook(
  uuid: UUID,
  update: BookUpdate | null,
  relations: BookRelationsUpdate = {},
  userId?: UUID,
) {
  await db.transaction().execute(async (tr) => {
    if (update && Object.keys(update).length) {
      await tr
        .updateTable("book")
        .set(update)
        .where("uuid", "=", uuid)
        .execute()
    }

    if (relations.creators) {
      await tr
        .deleteFrom("bookToCreator")
        .where("bookToCreator.bookUuid", "=", uuid)
        .execute()

      for (const creator of relations.creators) {
        let existing = await tr
          .selectFrom("creator")
          .select(["uuid"])
          .where((eb) =>
            creator.uuid
              ? eb.or([
                  eb("creator.name", "=", creator.name),
                  eb("creator.uuid", "=", creator.uuid),
                ])
              : eb("creator.name", "=", creator.name),
          )
          .executeTakeFirst()

        if (!existing) {
          existing = await tr
            .insertInto("creator")
            .values({
              name: creator.name,
              fileAs: creator.fileAs,
            })
            .returning(["uuid as uuid"])
            .executeTakeFirstOrThrow()
        }

        await tr
          .insertInto("bookToCreator")
          .values({
            creatorUuid: existing.uuid,
            bookUuid: uuid,
            role: creator.role,
          })
          .execute()
      }

      await tr
        .deleteFrom("creator")
        .where("creator.uuid", "not in", (eb) =>
          eb.selectFrom("bookToCreator").select(["bookToCreator.creatorUuid"]),
        )
        .execute()
    }

    if (relations.series) {
      await tr
        .deleteFrom("bookToSeries")
        .where("bookToSeries.bookUuid", "=", uuid)
        .execute()

      for (const series of relations.series) {
        let existing = await tr
          .selectFrom("series")
          .select(["uuid"])
          .where((eb) =>
            series.uuid
              ? eb.or([
                  eb("series.name", "=", series.name),
                  eb("series.uuid", "=", series.uuid),
                ])
              : eb("series.name", "=", series.name),
          )
          .executeTakeFirst()

        if (!existing) {
          existing = await tr
            .insertInto("series")
            .values({
              name: series.name,
              description: series.description,
            })
            .returning(["uuid as uuid"])
            .executeTakeFirstOrThrow()
        }

        if (series.featured) {
          await tr
            .updateTable("bookToSeries")
            .set({ featured: false })
            .where("bookUuid", "=", uuid)
            .execute()
        }

        await tr
          .insertInto("bookToSeries")
          .values({
            seriesUuid: existing.uuid,
            bookUuid: uuid,
            position: series.position,
            featured: series.featured,
          })
          .execute()
      }

      await tr
        .deleteFrom("series")
        .where("series.uuid", "not in", (eb) =>
          eb.selectFrom("bookToSeries").select(["bookToSeries.seriesUuid"]),
        )
        .execute()
    }

    if (relations.collections) {
      const collections = relations.collections
      if (collections.length) {
        await tr
          .insertInto("bookToCollection")
          .columns(["bookUuid", "collectionUuid"])
          .expression((eb) =>
            eb
              .selectFrom(() =>
                collections
                  .map((collection) =>
                    tr
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

      await tr
        .deleteFrom("bookToCollection")
        .where("bookUuid", "=", uuid)
        .where("collectionUuid", "not in", relations.collections)
        .execute()
    }

    if (relations.tags) {
      const tags = relations.tags
      if (tags.length) {
        await tr
          .insertInto("tag")
          .columns(["name"])
          .expression((eb) =>
            eb
              .selectFrom(() =>
                tags
                  .map((tag) =>
                    tr.selectNoFrom([eb.val(tag).as("name")]).where((web) =>
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

        await tr
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

      await tr
        .deleteFrom("bookToTag")
        .where("bookUuid", "=", uuid)
        .where((web) =>
          web(
            "tagUuid",
            "not in",
            web
              .selectFrom("tag")
              .select(["uuid"])
              .where("tag.name", "in", tags),
          ),
        )
        .execute()

      await tr
        .deleteFrom("tag")
        .where("tag.uuid", "not in", (eb) =>
          eb.selectFrom("bookToTag").select(["bookToTag.tagUuid"]),
        )
        .execute()
    }

    if (relations.ebook) {
      const existing = await tr
        .selectFrom("ebook")
        .select(["uuid"])
        .where("bookUuid", "=", uuid)
        .executeTakeFirst()

      if (existing) {
        await tr
          .updateTable("ebook")
          .set(relations.ebook)
          .where("uuid", "=", existing.uuid)
          .execute()
      } else {
        await tr
          .insertInto("ebook")
          .values({ bookUuid: uuid, filepath: relations.ebook.filepath })
          .execute()
      }
    }

    if (relations.audiobook) {
      const existing = await tr
        .selectFrom("audiobook")
        .select(["uuid"])
        .where("bookUuid", "=", uuid)
        .executeTakeFirst()

      if (existing) {
        await tr
          .updateTable("audiobook")
          .set(relations.audiobook)
          .where("uuid", "=", existing.uuid)
          .execute()
      } else {
        await tr
          .insertInto("audiobook")
          .values({ bookUuid: uuid, filepath: relations.audiobook.filepath })
          .execute()
      }
    }

    if (relations.readaloud) {
      const existing = await tr
        .selectFrom("readaloud")
        .select(["uuid"])
        .where("bookUuid", "=", uuid)
        .executeTakeFirst()

      if (existing) {
        await tr
          .updateTable("readaloud")
          .set(relations.readaloud)
          .where("uuid", "=", existing.uuid)
          .execute()
      } else {
        await tr
          .insertInto("readaloud")
          .values({ bookUuid: uuid, ...relations.readaloud })
          .execute()
      }
    }

    if (relations.books) {
      await tr
        .updateTable("ebook")
        .set({ bookUuid: uuid })
        .where("bookUuid", "in", relations.books)
        .execute()

      await tr
        .updateTable("audiobook")
        .set({ bookUuid: uuid })
        .where("bookUuid", "in", relations.books)
        .execute()

      await tr
        .updateTable("readaloud")
        .set({ bookUuid: uuid })
        .where("bookUuid", "in", relations.books)
        .execute()

      await tr
        .updateTable("position")
        .set({ bookUuid: uuid })
        .where("bookUuid", "in", relations.books)
        .execute()

      for (const bookUuid of relations.books) {
        await deleteBook(bookUuid, tr)
      }
    }

    if (relations.status) {
      await tr
        .updateTable("bookToStatus")
        .set({ statusUuid: relations.status.statusUuid })
        .where("userId", "=", relations.status.userId)
        .where("bookUuid", "=", uuid)
        .execute()
    }
  })

  const book = await getBook(uuid, userId)

  if (!book) throw new Error(`Failed to retrieve book with uuid ${uuid}`)

  BookEvents.emit("message", {
    type: "bookUpdated",
    bookUuid: uuid,
    payload: book,
  })

  return book
}
