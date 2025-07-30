"use client"

import { api, useGetShelvesQuery } from "@/store/api"
import { Stack } from "@mantine/core"
import { Shelf } from "./Shelf"
import { useMemo, useState } from "react"
import { UUID } from "@/uuid"
import { CollectionToolbar } from "../collections/toolbar/CollectionToolbar"
import { BookDetail, Shelves } from "@/apiModels"
import { useInitialData } from "@/hooks/useInitialData"

interface Props {
  shelves: Shelves
  books: BookDetail[]
}

export function BookShelves({
  shelves: initialShelves,
  books: initialBooks,
}: Props) {
  useInitialData(
    api.util.upsertQueryData("getShelves", undefined, initialShelves),
  )
  useInitialData(api.util.upsertQueryData("listBooks", undefined, initialBooks))

  const { data: shelves } = useGetShelvesQuery()

  const [selected, setSelected] = useState(() => new Set<UUID>())
  const [isEditing, setIsEditing] = useState(false)

  const allShelfBooks = useMemo(() => {
    if (!shelves) return []
    return [
      ...shelves.currentlyReading,
      ...shelves.nextUp,
      ...shelves.recentlyAdded,
      ...shelves.startReading,
    ]
  }, [shelves])

  if (!shelves) return null

  return (
    <Stack>
      <CollectionToolbar
        books={allShelfBooks}
        selected={selected}
        setSelected={setSelected}
        isEditing={isEditing}
        setIsEditing={setIsEditing}
      />
      <Shelf
        label="Currently reading"
        books={shelves.currentlyReading}
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
        label="Next up"
        books={shelves.nextUp}
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
        books={shelves.startReading}
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
        books={shelves.recentlyAdded}
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
    </Stack>
  )
}
