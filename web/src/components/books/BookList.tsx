"use client"

import { Stack, Text } from "@mantine/core"
import { useFilterSortedBooks } from "@/hooks/useFilterSortedBooks"
import { UUID } from "@/uuid"
import { useState } from "react"
import { CollectionToolbar } from "../collections/toolbar/CollectionToolbar"
import { BookGrid } from "./BookGrid"
import { useListBooksQuery, useListCollectionsQuery } from "@/store/api"
import { AddBooksMenu } from "./AddBooksMenu"
import { FilterSort } from "../collections/FilterSort"
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

  return (
    <Stack>
      <FilterSort options={options} />
      <CollectionToolbar
        collection={collection}
        books={books}
        selected={selected}
        setSelected={setSelected}
        isEditing={isEditing}
        setIsEditing={setIsEditing}
      />
      {isLoading ? (
        <BookGridSkeleton />
      ) : books.length ? (
        <BookGrid
          filterSortOptions={options}
          books={books}
          isSelecting={isEditing}
          selected={selected}
          onSelect={(bookUuid) => {
            setSelected((prev) => {
              const next = new Set(prev)
              if (prev.has(bookUuid)) {
                next.delete(bookUuid)
              } else {
                next.add(bookUuid)
              }
              return next
            })
          }}
        />
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
