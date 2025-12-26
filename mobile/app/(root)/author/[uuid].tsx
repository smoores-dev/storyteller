import { useLocalSearchParams } from "expo-router"
import { useMemo } from "react"

import { BookGrid } from "@/components/BookGrid"
import { type BookWithRelations } from "@/database/books"
import { useGetCreatorQuery, useListBooksQuery } from "@/store/localApi"
import { type UUID } from "@/uuid"

const EMPTY_BOOKS: BookWithRelations[] = []

export default function AuthorScreen() {
  const { uuid } = useLocalSearchParams() as { uuid: UUID }

  const { data: books = EMPTY_BOOKS } = useListBooksQuery()
  const { data: author } = useGetCreatorQuery({ uuid })

  const booksByAuthor = useMemo(
    () =>
      author
        ? books.filter((book) =>
            book.authors.some((a) => a.uuid === author.uuid),
          )
        : [],
    [author, books],
  )

  if (!author) return null

  return <BookGrid title={author.name} books={booksByAuthor} />
}
