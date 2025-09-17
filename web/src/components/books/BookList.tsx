"use client"

import { Stack, Text } from "@mantine/core"
import { useState } from "react"

import { useFilterSortedBooks } from "@/hooks/useFilterSortedBooks"
import { useListBooksQuery, useListCollectionsQuery } from "@/store/api"
import { type UUID } from "@/uuid"

import { AddBooksMenu } from "./AddBooksMenu"
import { BookGrid } from "./BookGrid"
import { BookGridSkeleton } from "./BookGridSkeleton"

interface Props {
  collectionUuid?: UUID | null
}

export function BookList({ collectionUuid }: Props) {
  const { collectionBooks, isLoading } = useListBooksQuery(undefined, {
    selectFromResult: (result) => ({
      isLoading: result.isUninitialized || result.isLoading,
      collectionBooks:
        typeof collectionUuid === "string"
          ? result.data?.filter((book) =>
              book.collections.some((c) => c.uuid === collectionUuid),
            )
          : collectionUuid === null
            ? result.data?.filter((book) => book.collections.length === 0)
            : result.data,
    }),
  })

  const { collection } = useListCollectionsQuery(undefined, {
    selectFromResult: (result) => ({
      collection: result.data?.find(
        (collection) => collection.uuid === collectionUuid,
      ),
    }),
  })

  const { books, options } = useFilterSortedBooks(collectionBooks ?? [])

  const [selected, setSelected] = useState(() => new Set<UUID>())
  const [isEditing, setIsEditing] = useState(false)

  const shouldHide =
    books.length === 0 && !options.search && !options.filters.visible

  return (
    <Stack className="relative mt-4 h-full">
      {isLoading ? (
        <BookGridSkeleton />
      ) : !shouldHide ? (
        <>
          <Text className="text-xs">{books.length} books</Text>
          <BookGrid
            filterSortOptions={options}
            books={books}
            isSelecting={isEditing}
            selected={selected}
            collection={collection}
            setSelected={setSelected}
            isEditing={isEditing}
            setIsEditing={setIsEditing}
            showCollectionToolbar
          />
        </>
      ) : collectionUuid === null ? (
        <Text>There’s nothing here! Congrats on being so well organized!</Text>
      ) : (
        <Stack>
          <Text>There’s nothing here!</Text>
          <AddBooksMenu
            className="self-start"
            variant="filled"
            collection={collection}
          />
        </Stack>
      )}
    </Stack>
  )
}
