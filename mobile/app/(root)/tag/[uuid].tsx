import { useLocalSearchParams } from "expo-router"
import { useMemo } from "react"

import { BookGrid } from "@/components/BookGrid"
import { type BookWithRelations } from "@/database/books"
import { useGetTagQuery, useListBooksQuery } from "@/store/localApi"
import { type UUID } from "@/uuid"

const EMPTY_BOOKS: BookWithRelations[] = []

export default function TagScreen() {
  const { uuid } = useLocalSearchParams() as { uuid: UUID }

  const { data: books = EMPTY_BOOKS } = useListBooksQuery()
  const { data: tag } = useGetTagQuery({ uuid })

  const booksWithTag = useMemo(
    () =>
      tag
        ? books.filter((book) => book.tags.some((t) => t.uuid === tag.uuid))
        : [],
    [tag, books],
  )

  if (!tag) return null

  return <BookGrid title={tag.name} books={booksWithTag} />
}
