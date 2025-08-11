import { Selectable, Insertable, Updateable } from "kysely"
import { DB } from "./schema"
import { db } from "./connection"
import { getBooks, NewBookToSeries } from "./books"
import { BookEvents } from "@/events"
import { UUID } from "@/uuid"

export type Series = Selectable<DB["series"]>
export type NewSeries = Insertable<DB["series"]>
export type SeriesUpdate = Updateable<DB["series"]>

export type NewSeriesRelation = Omit<NewBookToSeries, "seriesUuid">

export async function getSeries() {
  return await db.selectFrom("series").selectAll().execute()
}

export async function addBooksToSeries(
  series: NewSeries,
  relations: NewSeriesRelation[],
) {
  let existing = await db
    .selectFrom("series")
    .select(["uuid"])
    .where("name", "=", series.name)
    .executeTakeFirst()

  if (!existing) {
    existing = await db
      .insertInto("series")
      .values(series)
      .returning(["uuid as uuid"])
      .executeTakeFirstOrThrow()
  }

  await db
    .insertInto("bookToSeries")
    .values(
      relations.map((relation) => ({
        bookUuid: relation.bookUuid,
        seriesUuid: existing.uuid,
        position: relation.position,
      })),
    )
    .execute()

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
  await db
    .deleteFrom("bookToSeries")
    .where("bookUuid", "in", bookUuids)
    .where("seriesUuid", "in", seriesUuids)
    .execute()

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
  await db.transaction().execute(async (tr) => {
    if (Object.keys(update).length) {
      await tr
        .updateTable("series")
        .set(update)
        .where("uuid", "=", uuid)
        .execute()
    }

    await tr.deleteFrom("bookToSeries").where("seriesUuid", "=", uuid).execute()

    if (relations.books) {
      await tr
        .insertInto("bookToSeries")
        .values(
          relations.books.map((relation) => ({
            ...relation,
            seriesUuid: uuid,
          })),
        )
        .execute()
    }
  })

  if (relations.books) {
    const books = await getBooks(relations.books.map((book) => book.bookUuid))

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
