import { useLocalSearchParams } from "expo-router"
import { useMemo } from "react"

import { BookGrid } from "@/components/BookGrid"
import { type BookWithRelations } from "@/database/books"
import { useGetCollectionQuery, useListBooksQuery } from "@/store/localApi"
import { type UUID } from "@/uuid"

const EMPTY_BOOKS: BookWithRelations[] = []

export default function CollectionScreen() {
  const { uuid } = useLocalSearchParams() as { uuid: UUID }

  const { data: books = EMPTY_BOOKS } = useListBooksQuery()
  const { data: collection } = useGetCollectionQuery({ uuid })

  const booksByCollection = useMemo(
    () =>
      collection
        ? books.filter((book) =>
            book.collections.some((c) => c.uuid === collection.uuid),
          )
        : [],
    [collection, books],
  )

  if (!collection) return null

  return <BookGrid title={collection.name} books={booksByCollection} />
}
