import { withHasPermission } from "@/auth/auth"
import {
  addBooksToSeries,
  NewSeries,
  NewSeriesRelation,
  removeBooksFromSeries,
} from "@/database/series"
import { UUID } from "@/uuid"

export const POST = withHasPermission("bookUpdate")(async (request) => {
  const body = (await request.json()) as {
    series: NewSeries
    relations: NewSeriesRelation[]
  }
  const { series, relations } = body
  await addBooksToSeries(series, relations)

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
