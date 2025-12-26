import { useLocalSearchParams } from "expo-router"
import { useMemo } from "react"

import { BookGrid } from "@/components/BookGrid"
import { type BookWithRelations } from "@/database/books"
import { useGetCreatorQuery, useListBooksQuery } from "@/store/localApi"
import { type UUID } from "@/uuid"

const EMPTY_BOOKS: BookWithRelations[] = []

export default function NarratorScreen() {
  const { uuid } = useLocalSearchParams() as { uuid: UUID }

  const { data: books = EMPTY_BOOKS } = useListBooksQuery()
  const { data: narrator } = useGetCreatorQuery({ uuid })

  const booksByNarrator = useMemo(
    () =>
      narrator
        ? books.filter((book) =>
            book.narrators.some((n) => n.uuid === narrator.uuid),
          )
        : [],
    [narrator, books],
  )

  if (!narrator) return null

  return <BookGrid title={narrator.name} books={booksByNarrator} />
}
