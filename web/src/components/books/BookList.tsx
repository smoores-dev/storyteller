"use client"

import { Group, Stack, Text } from "@mantine/core"
import { useFilterSortedBooks } from "@/hooks/useFilterSortedBooks"
import { usePermission } from "@/hooks/usePermission"
import { Search } from "./Search"
import { Sort } from "./Sort"
import { UUID } from "@/uuid"
import { useState } from "react"
import { CollectionToolbar } from "../collections/toolbar/CollectionToolbar"
import { BookGrid } from "./BookGrid"
import { useListBooksQuery, useListCollectionsQuery } from "@/store/api"
import { AddBooksMenu } from "./AddBooksMenu"

interface Props {
  collectionUuid?: UUID | null
}

export function BookList({ collectionUuid }: Props) {
  const canListBooks = usePermission("bookList")

  const { collectionBooks } = useListBooksQuery(undefined, {
    selectFromResult: (result) => ({
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

  // TODO: Should this just be passed in as a prop?
  const { collection } = useListCollectionsQuery(undefined, {
    selectFromResult: (result) => ({
      collection: result.data?.find(
        (collection) => collection.uuid === collectionUuid,
      ),
    }),
  })

  const { books, onFilterChange, filter, sort, onSortChange } =
    useFilterSortedBooks(collectionBooks ?? [])

  const [selected, setSelected] = useState(() => new Set<UUID>())
  const [isEditing, setIsEditing] = useState(false)

  return (
    <>
      {canListBooks && (
        <Stack>
          <Group>
            <Search value={filter} onValueChange={onFilterChange} />
            <Sort value={sort} onValueChange={onSortChange} />
          </Group>
          <CollectionToolbar
            collection={collection}
            books={books}
            selected={selected}
            setSelected={setSelected}
            isEditing={isEditing}
            setIsEditing={setIsEditing}
          />
          {books.length ? (
            <BookGrid
              books={books}
              isSelecting={isEditing}
              selected={selected}
              onSelect={(bookUuid) => {
                setSelected((prev) => {
                  const next = new Set(prev)
                  if (selected.has(bookUuid)) {
                    next.delete(bookUuid)
                  } else {
                    next.add(bookUuid)
                  }
                  return next
                })
              }}
            />
          ) : collectionUuid === null ? (
            <Text>
              There’s nothing here! Congrats on being so well organized!
            </Text>
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
      )}
    </>
  )
}
