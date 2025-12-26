import { useLocalSearchParams } from "expo-router"
import { useMemo } from "react"

import { BookGrid } from "@/components/BookGrid"
import { type BookWithRelations } from "@/database/books"
import { useGetSeriesQuery, useListBooksQuery } from "@/store/localApi"
import { type UUID } from "@/uuid"

const EMPTY_BOOKS: BookWithRelations[] = []

export default function SeriesScreen() {
  const { uuid } = useLocalSearchParams() as { uuid: UUID }

  const { data: books = EMPTY_BOOKS } = useListBooksQuery()
  const { data: series } = useGetSeriesQuery({ uuid })

  const booksBySeries = useMemo(
    () =>
      series
        ? books.filter((book) =>
            book.series.some((s) => s.uuid === series.uuid),
          )
        : [],
    [series, books],
  )

  if (!series) return null

  return <BookGrid title={series.name} books={booksBySeries} />
}
