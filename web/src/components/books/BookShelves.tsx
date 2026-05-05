"use client"

import { Stack, Text } from "@mantine/core"
import { useMemo, useState } from "react"

import { CollectionToolbar } from "@/components/collections/toolbar/CollectionToolbar"
import { type BookWithRelations } from "@/database/books"
import { useListBooksQuery, useListStatusesQuery } from "@/store/api"
import { type UUID } from "@/uuid"

import { BookGridSkeleton } from "./BookGridSkeleton"
import { Shelf } from "./Shelf"

const EMPTY_BOOKS: BookWithRelations[] = []

function filterNextUp(books: BookWithRelations[]) {
  const seriesToBooks = books.reduce((acc, book) => {
    for (const s of book.series) {
      acc.set(
        s.uuid,
        (acc.get(s.uuid) ?? [])
          .concat({ position: s.position ?? 0, book })
          .sort((a, b) => a.position - b.position),
      )
    }
    return acc
  }, new Map<UUID, { position: number; book: BookWithRelations }[]>())

  const resultBooks = new Set<BookWithRelations>()
  for (const seriesBooks of seriesToBooks.values()) {
    const lastReadBook = seriesBooks.findLast(
      (b) => b.book.status?.name === "Read",
    )
    const lastUnreadBook = seriesBooks.findLast(
      (b) => b.book.status?.name !== "Read",
    )

    if (
      lastReadBook &&
      lastUnreadBook &&
      lastReadBook.position < lastUnreadBook.position
    ) {
      resultBooks.add(lastUnreadBook.book)
    }
  }

  return Array.from(resultBooks)
}

export function BookShelves() {
  const { data: books = EMPTY_BOOKS, isLoading } = useListBooksQuery()
  const { data: statuses } = useListStatusesQuery()
  const toReadStatus =
    statuses?.find((status) => status.name === "To read") ?? null
  const readingStatus =
    statuses?.find((status) => status.name === "Reading") ?? null

  const [selected, setSelected] = useState(() => new Set<UUID>())
  const [isEditing, setIsEditing] = useState(false)

  const currentlyReading = useMemo(() => {
    return books
      .filter((book) => book.status?.name === "Reading")
      .sort(
        (a, b) => (b.position?.timestamp ?? 0) - (a.position?.timestamp ?? 0),
      )
  }, [books])

  const nextUp = useMemo(() => {
    return filterNextUp(books)
  }, [books])

  const startReading = useMemo(() => {
    return books
      .filter((book) => book.status?.name === "To read")
      .sort(
        (a, b) =>
          new Date(b.createdAt).valueOf() - new Date(a.createdAt).valueOf(),
      )
  }, [books])

  const recentlyAdded = useMemo(() => {
    return books
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdAt).valueOf() - new Date(a.createdAt).valueOf(),
      )
  }, [books])

  const allShelfBooks = useMemo(
    () => [...currentlyReading, ...nextUp, ...startReading, ...recentlyAdded],
    [currentlyReading, nextUp, recentlyAdded, startReading],
  )

  return (
    <Stack>
      <CollectionToolbar
        books={allShelfBooks}
        selected={selected}
        setSelected={setSelected}
        isEditing={isEditing}
        setIsEditing={setIsEditing}
      />
      {isLoading ? (
        <BookGridSkeleton />
      ) : books.length ? (
        <>
          <Shelf
            label="Currently reading"
            href={`/books?statuses=${readingStatus?.uuid}`}
            books={currentlyReading}
            isSelecting={isEditing}
            selected={selected}
            onSelect={(uuid) => {
              setSelected((prev) => {
                const next = new Set(prev)
                if (selected.has(uuid)) {
                  next.delete(uuid)
                } else {
                  next.add(uuid)
                }
                return next
              })
            }}
          />
          <Shelf
            label="Next up in series"
            href="/series"
            books={nextUp}
            isSelecting={isEditing}
            selected={selected}
            onSelect={(uuid) => {
              setSelected((prev) => {
                const next = new Set(prev)
                if (selected.has(uuid)) {
                  next.delete(uuid)
                } else {
                  next.add(uuid)
                }
                return next
              })
            }}
          />
          <Shelf
            label="Start reading"
            href={`/books?statuses=${toReadStatus?.uuid}&sort=create-time,desc`}
            books={startReading}
            isSelecting={isEditing}
            selected={selected}
            onSelect={(uuid) => {
              setSelected((prev) => {
                const next = new Set(prev)
                if (selected.has(uuid)) {
                  next.delete(uuid)
                } else {
                  next.add(uuid)
                }
                return next
              })
            }}
          />
          <Shelf
            label="Recently added"
            href={`/books?sort=create-time,desc`}
            books={recentlyAdded}
            isSelecting={isEditing}
            selected={selected}
            onSelect={(uuid) => {
              setSelected((prev) => {
                const next = new Set(prev)
                if (selected.has(uuid)) {
                  next.delete(uuid)
                } else {
                  next.add(uuid)
                }
                return next
              })
            }}
          />
        </>
      ) : (
        <Text>
          There’s nothing here! Upload a book or configure an automatic import
          folder in the settings to get started.
        </Text>
      )}
    </Stack>
  )
}
