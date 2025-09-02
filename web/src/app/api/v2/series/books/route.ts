import { withHasPermission } from "@/auth/auth"
import {
  type NewSeries,
  type NewSeriesRelation,
  addBooksToSeries,
  removeBooksFromSeries,
} from "@/database/series"
import { type UUID } from "@/uuid"
import { queueWritesToFiles } from "@/writeToFiles/fileWriteDistributor"

export const POST = withHasPermission("bookUpdate")(async (request) => {
  const body = (await request.json()) as {
    series: NewSeries
    relations: NewSeriesRelation[]
  }
  const { series, relations } = body
  await addBooksToSeries(series, relations)

  for (const relation of relations) {
    void queueWritesToFiles(relation.bookUuid)
  }

  return new Response(null, { status: 204 })
})

export const DELETE = withHasPermission("bookUpdate")(async (request) => {
  const body = (await request.json()) as {
    series: UUID[]
    books: UUID[]
  }
  const { series, books } = body
  await removeBooksFromSeries(series, books)

  return new Response(null, { status: 204 })
})
