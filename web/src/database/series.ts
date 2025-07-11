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
