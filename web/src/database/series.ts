import { Selectable, Insertable, Updateable } from "kysely"
import { BookToSeries, DB } from "./schema"
import { db } from "./connection"
import { getBooks, NewBookToSeries } from "./books"
import { BookEvents } from "@/events"
import { UUID } from "@/uuid"

export type Series = Selectable<DB["series"]>
export type NewSeries = Insertable<DB["series"]>
export type SeriesUpdate = Updateable<DB["series"]>

export type NewSeriesRelation = Omit<NewBookToSeries, "seriesUuid">

export async function getSeries(userId?: UUID) {
  return await db
    .selectFrom("series")
    .$if(!!userId, (qb) =>
      qb
        .innerJoin("bookToSeries", "bookToSeries.seriesUuid", "series.uuid")
        .leftJoin(
          "bookToCollection",
          "bookToSeries.bookUuid",
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
    .groupBy("series.uuid")
    .selectAll("series")
    .execute()
}

export async function addBooksToSeries(
  series: NewSeries,
  relations: NewSeriesRelation[],
) {
  await db.transaction().execute(async (tr) => {
    let existing = await tr
      .selectFrom("series")
      .select(["uuid"])
      .where("name", "=", series.name)
      .executeTakeFirst()

    if (!existing) {
      existing = await tr
        .insertInto("series")
        .values(series)
        .returning(["uuid as uuid"])
        .executeTakeFirstOrThrow()
    }

    const withNewFeatured = relations.filter(
      (relation) => relation.featured && relation.uuid,
    )

    if (withNewFeatured[0]?.featured) {
      await tr
        .updateTable("bookToSeries")
        .set({ featured: false })
        .where(
          "bookToSeries.bookUuid",
          "in",
          // uuid is filtered for above
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          withNewFeatured.map(({ uuid }) => uuid!),
        )
        .execute()
    }

    await tr
      .insertInto("bookToSeries")
      .values(
        relations.map((relation) => ({
          bookUuid: relation.bookUuid,
          seriesUuid: existing.uuid,
          position: relation.position,
          featured: relation.featured,
        })),
      )
      .execute()
  })

  const books = await getBooks(relations.map((relation) => relation.bookUuid))

  books.forEach((book) => {
    BookEvents.emit("message", {
      type: "bookUpdated",
      bookUuid: book.uuid,
      payload: {
        series: book.series,
      },
    })
  })
}

export async function removeBooksFromSeries(
  seriesUuids: UUID[],
  bookUuids: UUID[],
) {
  await db.transaction().execute(async (tr) => {
    await tr
      .deleteFrom("bookToSeries")
      .where("bookUuid", "in", bookUuids)
      .where("seriesUuid", "in", seriesUuids)
      .execute()

    await tr
      .deleteFrom("series")
      .where("series.uuid", "not in", (eb) =>
        eb.selectFrom("bookToSeries").select(["bookToSeries.seriesUuid"]),
      )
      .execute()
  })

  const books = await getBooks(bookUuids)

  books.forEach((book) => {
    BookEvents.emit("message", {
      type: "bookUpdated",
      bookUuid: book.uuid,
      payload: {
        series: book.series,
      },
    })
  })
}

export async function updateSeries(
  uuid: UUID,
  update: SeriesUpdate,
  relations: { books?: NewSeriesRelation[] },
) {
  const affectedBooks = await db.transaction().execute(async (tr) => {
    if (Object.keys(update).length) {
      await tr
        .updateTable("series")
        .set(update)
        .where("uuid", "=", uuid)
        .execute()
    }

    let insertedBooks: Pick<BookToSeries, "bookUuid">[] = []
    const deletedSeries = await tr
      .deleteFrom("bookToSeries")
      .where("seriesUuid", "=", uuid)
      .returning(["bookToSeries.bookUuid"])
      .execute()

    if (relations.books) {
      insertedBooks = await tr
        .insertInto("bookToSeries")
        .values(
          relations.books.map((relation) => ({
            ...relation,
            seriesUuid: uuid,
          })),
        )
        .returning(["bookToSeries.bookUuid"])
        .execute()
    }

    return new Set([
      ...deletedSeries.map((b) => b.bookUuid),
      ...insertedBooks.map((b) => b.bookUuid),
    ])
  })

  if (affectedBooks.size) {
    const books = await getBooks(Array.from(affectedBooks))

    books.forEach((book) => {
      BookEvents.emit("message", {
        type: "bookUpdated",
        bookUuid: book.uuid,
        payload: {
          series: book.series,
        },
      })
    })
  }

  return await db
    .selectFrom("series")
    .selectAll()
    .where("uuid", "=", uuid)
    .executeTakeFirstOrThrow()
}

export async function deleteSeries(uuid: UUID) {
  const bookUuids = await db.transaction().execute(async (tr) => {
    const bookUuids = await tr
      .selectFrom("bookToSeries")
      .select(["bookUuid"])
      .where("seriesUuid", "=", uuid)
      .execute()
    await tr.deleteFrom("bookToSeries").where("seriesUuid", "=", uuid).execute()

    await tr.deleteFrom("series").where("uuid", "=", uuid).execute()
    return bookUuids
  })

  const books = await getBooks(bookUuids.map((book) => book.bookUuid))

  books.forEach((book) => {
    BookEvents.emit("message", {
      type: "bookUpdated",
      bookUuid: book.uuid,
      payload: {
        series: book.series,
      },
    })
  })
}
