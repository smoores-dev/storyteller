"use client"

import { useGetShelvesQuery, useListBooksQuery } from "@/store/api"
import { Stack } from "@mantine/core"
import { Shelf } from "./Shelf"
import { useMemo, useState } from "react"
import { UUID } from "@/uuid"
import { CollectionToolbar } from "../collections/toolbar/CollectionToolbar"

export function BookShelves() {
  // Kick this off, since it's used everywhere
  useListBooksQuery()
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
