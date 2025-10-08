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
        (a, b) => (a.position?.timestamp ?? 0) - (b.position?.timestamp ?? 0),
      )
  }, [books])

  const nextUp = useMemo(() => {
    const latestReadInSeries = new Map<UUID, BookWithRelations>()
    const resultSet = new Set<UUID>()
    for (const book of books) {
      if (!book.series.length) continue

      const series = book.series
      for (const s of series) {
        const latestRead = latestReadInSeries.get(s.uuid)
        if (!latestRead) {
          if (book.status?.name === "Read") {
            latestReadInSeries.set(s.uuid, book)
            continue
          } else {
            continue
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const latestSeriesPos = latestRead.series.find(
          (ls) => ls.uuid === s.uuid,
        )!.position
        if ((latestSeriesPos ?? 0) < (s.position ?? 0)) {
          if (book.status?.name === "Read") {
            latestReadInSeries.set(s.uuid, book)
          } else if (!resultSet.has(book.uuid)) {
            resultSet.add(book.uuid)
          }
        }
      }
    }

    return books
      .filter((book) => resultSet.has(book.uuid))
      .sort((a, b) => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const latestA = a.series
          .map((s) => latestReadInSeries.get(s.uuid))
          .filter((book) => !!book)[0]!
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const latestB = b.series
          .map((s) => latestReadInSeries.get(s.uuid))
          .filter((book) => !!book)[0]!

        return (
          (latestB.position?.timestamp ?? 0) -
          (latestA.position?.timestamp ?? 0)
        )
      })
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
